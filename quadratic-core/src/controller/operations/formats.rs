use super::operation::Operation;
use crate::{
    controller::GridController,
    grid::{
        formats::{format_update::FormatUpdate, Formats},
        generate_borders, BorderSelection, Sheet,
    },
    selection::Selection,
    Rect,
};

impl GridController {
    pub(crate) fn clear_border_op(sheet: &Sheet, rect: &Rect) -> Operation {
        let selections = vec![BorderSelection::Clear];
        let borders = generate_borders(sheet, rect, selections, None);
        Operation::SetBorders {
            sheet_rect: rect.to_sheet_rect(sheet.id),
            borders,
        }
    }

    pub(crate) fn clear_format_selection_operations(
        &self,
        selection: &Selection,
    ) -> Vec<Operation> {
        let mut ops = vec![Operation::SetCellFormatsSelection {
            selection: selection.clone(),
            formats: Formats::repeat(FormatUpdate::cleared(), selection.count()),
        }];
        let sheet_id = selection.sheet_id;
        if let Some(sheet) = self.try_sheet(sheet_id) {
            // todo: this is very hacky. We need to refactor borders to make
            // this work the same as all other formats.
            if let Some(rects) = selection.rects.as_ref() {
                rects.iter().for_each(|rect| {
                    ops.push(GridController::clear_border_op(sheet, rect));
                });
            }
        }
        ops
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Rect;
    use serial_test::parallel;

    #[test]
    #[parallel]
    fn clear_format_selection_operations() {
        let gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let selection = Selection {
            sheet_id,
            x: 0,
            y: 0,
            rects: Some(vec![Rect::from_numbers(0, 0, 1, 1)]),
            rows: None,
            columns: None,
            all: false,
        };
        let ops = gc.clear_format_selection_operations(&selection);
        assert_eq!(
            ops,
            vec![
                Operation::SetCellFormatsSelection {
                    selection,
                    formats: Formats::repeat(FormatUpdate::cleared(), 1),
                },
                GridController::clear_border_op(
                    gc.sheet(sheet_id),
                    &Rect::from_numbers(0, 0, 1, 1)
                )
            ]
        );
    }
}
