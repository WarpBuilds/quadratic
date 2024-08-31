use std::collections::HashSet;

use itertools::Itertools;
use smallvec::{smallvec, SmallVec};

use super::*;
use crate::{
    grid::Grid, Array, CellValue, CodeResult, CodeResultExt, Pos, RunErrorMsg, SheetPos, SheetRect,
    Span, Spanned, Value,
};

/// Formula execution context.
pub struct Ctx<'ctx> {
    /// Grid file to access cells from.
    pub grid: &'ctx Grid,
    /// Position in the grid from which the formula is being evaluated.
    pub sheet_pos: SheetPos,
    /// Cells that have been accessed in evaluating the formula.
    pub cells_accessed: HashSet<SheetRect>,

    /// Whether to only parse, skipping expensive computations.
    pub skip_computation: bool,
}
impl<'ctx> Ctx<'ctx> {
    /// Constructs a context for evaluating a formula at `pos` in `grid`.
    pub fn new(grid: &'ctx Grid, sheet_pos: SheetPos) -> Self {
        Ctx {
            grid,
            sheet_pos,
            cells_accessed: HashSet::new(),
            skip_computation: false,
        }
    }

    /// Constructs a context for checking the syntax and some basic types of a
    /// formula in `grid`. Expensive computations are skipped, so the value
    /// returned by "evaluating" the formula will be nonsense (probably blank).
    pub fn new_for_syntax_check(grid: &'ctx Grid) -> Self {
        Ctx {
            grid,
            sheet_pos: Pos::ORIGIN.to_sheet_pos(grid.sheets()[0].id),
            cells_accessed: HashSet::new(),
            skip_computation: true,
        }
    }

    /// Resolves a cell reference relative to `self.sheet_pos`.
    pub fn resolve_ref(&self, ref_pos: &CellRef, span: Span) -> CodeResult<Spanned<SheetPos>> {
        let sheet = match &ref_pos.sheet {
            Some(sheet_name) => self
                .grid
                .try_sheet_from_name(sheet_name.clone())
                .ok_or(RunErrorMsg::BadCellReference.with_span(span))?,
            None => self
                .grid
                .try_sheet(self.sheet_pos.sheet_id)
                .ok_or(RunErrorMsg::BadCellReference.with_span(span))?,
        };
        let ref_pos = ref_pos.resolve_from(self.sheet_pos.into());
        Ok(ref_pos.to_sheet_pos(sheet.id)).with_span(span)
    }
    /// Resolves a cell range reference relative to `self.sheet_pos`.
    pub fn resolve_range_ref(
        &self,
        range: &RangeRef,
        span: Span,
    ) -> CodeResult<Spanned<SheetRect>> {
        match range {
            RangeRef::RowRange { .. } => {
                Err(RunErrorMsg::Unimplemented("row range".into()).with_span(span))
            }
            RangeRef::ColRange { .. } => {
                Err(RunErrorMsg::Unimplemented("column range".into()).with_span(span))
            }
            RangeRef::CellRange { start, end } => {
                let sheet_pos_start = self.resolve_ref(start, span)?.inner;
                let sheet_pos_end = self.resolve_ref(end, span)?.inner;
                Ok(SheetRect::new_pos_span(
                    sheet_pos_start.into(),
                    sheet_pos_end.into(),
                    sheet_pos_start.sheet_id,
                ))
                .with_span(span)
            }
            RangeRef::Cell { pos } => {
                let sheet_pos = self.resolve_ref(pos, span)?.inner;
                Ok(SheetRect::single_sheet_pos(sheet_pos)).with_span(span)
            }
        }
    }

    /// Fetches the contents of the cell at `pos` evaluated at `self.sheet_pos`,
    /// or returns an error in the case of a circular reference.
    pub fn get_cell(&mut self, pos: SheetPos, span: Span) -> Spanned<CellValue> {
        if self.skip_computation {
            let value = CellValue::Blank;
            return Spanned { span, inner: value };
        }

        let error_value = |e: RunErrorMsg| {
            let value = CellValue::Error(Box::new(e.with_span(span)));
            Spanned { inner: value, span }
        };

        let Some(sheet) = self.grid.try_sheet(pos.sheet_id) else {
            return error_value(RunErrorMsg::BadCellReference);
        };
        if pos == self.sheet_pos {
            return error_value(RunErrorMsg::CircularReference);
        }

        self.cells_accessed.insert(pos.into());

        let value = sheet.get_cell_for_formula(pos.into());
        Spanned { inner: value, span }
    }

    /// Fetches the contents of the cell array at `rect`, or returns an error in
    /// the case of a circular reference.
    pub fn get_cell_array(&mut self, rect: SheetRect, span: Span) -> CodeResult<Spanned<Array>> {
        if self.skip_computation {
            return Ok(CellValue::Blank.into()).with_span(span);
        }

        let sheet_id = rect.sheet_id;
        let array_size = rect.size();
        if std::cmp::max(array_size.w, array_size.h).get() > crate::limits::CELL_RANGE_LIMIT {
            return Err(RunErrorMsg::ArrayTooBig.with_span(span));
        }

        let mut flat_array = smallvec![];
        // Reuse the same `CellRef` object so that we don't have to
        // clone `sheet_name.`
        for y in rect.y_range() {
            for x in rect.x_range() {
                // TODO: record array dependency instead of many individual cell dependencies
                flat_array.push(self.get_cell(SheetPos { x, y, sheet_id }, span).inner);
            }
        }

        Ok(Array::new_row_major(array_size, flat_array)?).with_span(span)
    }

    /// Evaluates a function once for each corresponding set of values from
    /// `arrays`.
    ///
    /// Many functions, including basic operators such as `+`, work on arrays by
    /// zipping the arrays and then mapping the function across corresponding
    /// sets of inputs. For example `{1,2,3} + {10,20,30}` results in
    /// `{11,22,33}`. If any argument is not an array, it is expanded into an
    /// array with the same size as other arguments. This also works
    /// 2-dimensionally: if one argument is a 1x3 array and the other argument
    /// is a 3x1 array, then both arguments are first expanded to 3x3 arrays. If
    /// arrays cannot be expanded like this, then an error is returned.
    pub fn zip_map<'a, I: Copy + IntoIterator<Item = &'a Spanned<Value>>>(
        &mut self,
        arrays: I,
        f: impl for<'b> Fn(&'b mut Ctx<'_>, &[Spanned<&CellValue>]) -> CodeResult<CellValue>,
    ) -> CodeResult<Value>
    where
        I::IntoIter: ExactSizeIterator,
    {
        if self.skip_computation {
            return Ok(CellValue::Blank.into());
        }

        let size = Value::common_array_size(arrays)?;

        let mut args_buffer = Vec::with_capacity(arrays.into_iter().len());

        // If the result is a single value, return that value instead of a 1x1
        // array. This isn't just an optimization; it's important for Excel
        // compatibility.
        if size.len() == 1 {
            for array in arrays {
                args_buffer.push(array.cell_value()?);
            }
            return Ok(Value::Single(f(self, &args_buffer)?));
        }

        let mut values = SmallVec::with_capacity(size.len());
        for (x, y) in size.iter() {
            args_buffer.clear();
            for array in arrays {
                args_buffer.push(array.get(x, y)?);
            }

            values.push(f(self, &args_buffer)?);
        }

        let result = Array::new_row_major(size, values)?;
        Ok(Value::Array(result))
    }

    /// Parses a sequence of `eval_range` and `criteria` arguments from `args`,
    /// then runs [`Ctx::zip_map()`] over the criteria arrays.
    ///
    /// This is useful for implementing functions that take multiple criteria,
    /// like `SUMIFS`, `COUNTIFS`, etc.
    pub fn zip_map_eval_ranges_and_criteria_from_args(
        &mut self,
        eval_range1: Spanned<Array>,
        criteria1: Spanned<Value>,
        mut remaining_args: FormulaFnArgs,
        f: impl for<'b> Fn(
            &'b mut Ctx<'_>,
            Vec<(&'b Spanned<Array>, Criterion)>,
        ) -> CodeResult<CellValue>,
    ) -> CodeResult<Value> {
        // Handle arguments.
        let mut i = 1;
        let mut eval_ranges = vec![eval_range1];
        let mut criteria = vec![criteria1];
        while let Some(eval_range) = remaining_args.take_next_optional() {
            i += 1;
            eval_ranges.push(eval_range.into_array()?);
            criteria.push(remaining_args.take_next_required(format!("criteria{i}"))?);
        }

        // Evaluate.
        self.zip_map(&criteria, |ctx, criteria| {
            let eval_ranges_and_criteria: Vec<(&Spanned<Array>, Criterion)> = eval_ranges
                .iter()
                .zip(criteria)
                .map(|(eval_range, &criterion_value)| {
                    CodeResult::Ok((eval_range, Criterion::try_from(criterion_value)?))
                })
                .try_collect()?;
            f(ctx, eval_ranges_and_criteria)
        })
    }
}
