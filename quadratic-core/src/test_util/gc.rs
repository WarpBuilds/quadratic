#[cfg(test)]
use crate::{
    CellValue, Pos, Rect,
    controller::GridController,
    formulas::convert_rc_to_a1,
    grid::{CodeCellLanguage, GridBounds, Sheet, SheetId},
};

#[cfg(test)]
use std::collections::HashMap;

#[cfg(test)]
use tabled::{
    builder::Builder,
    settings::{Color, themes::Colorization},
    settings::{Modify, Style},
};

#[track_caller]
#[cfg(test)]
pub fn str_vec_to_string_vec(values: &Vec<&str>) -> Vec<String> {
    values.iter().map(|s| s.to_string()).collect()
}

/// Run an assertion that a cell value is equal to the given value
#[track_caller]
#[cfg(test)]
pub fn assert_cell_value(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x: i64,
    y: i64,
    value: CellValue,
) {
    let sheet = grid_controller.sheet(sheet_id);
    let cell_value = sheet.cell_value(Pos { x, y }).unwrap();

    assert_eq!(
        value, cell_value,
        "Cell at ({}, {}) does not have the value {:?}, it's actually {:?}",
        x, y, value, cell_value
    );
}

/// Run an assertion that a cell value is equal to the given value using the first sheet of the gc
#[track_caller]
#[cfg(test)]
pub fn assert_display_cell_value_first_sheet(
    grid_controller: &GridController,
    x: i64,
    y: i64,
    value: &str,
) {
    assert_display_cell_value(grid_controller, grid_controller.sheet_ids()[0], x, y, value);
}

/// Run an assertion that a cell value is equal to the given value
#[track_caller]
#[cfg(test)]
pub fn assert_display_cell_value(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x: i64,
    y: i64,
    value: &str,
) {
    let sheet = grid_controller.sheet(sheet_id);
    let cell_value = sheet
        .display_value(Pos { x, y })
        .map_or_else(|| CellValue::Blank, |v| CellValue::Text(v.to_string()));
    let expected_text_or_blank =
        |v: &CellValue| v == &CellValue::Text(value.into()) || v == &CellValue::Blank;

    assert!(
        expected_text_or_blank(&cell_value),
        "Cell at ({}, {}) does not have the value {:?}, it's actually {:?}",
        x,
        y,
        CellValue::Text(value.into()),
        cell_value
    );
}

/// Run an assertion that a cell value is equal to the given value
#[track_caller]
#[cfg(test)]
pub fn assert_display_cell_value_pos(
    grid_controller: &GridController,
    sheet_id: SheetId,
    pos: Pos,
    value: &str,
) {
    assert_display_cell_value(grid_controller, sheet_id, pos.x, pos.y, value);
}

/// Run an assertion that a cell value is equal to the given value
#[track_caller]
#[cfg(test)]
pub fn assert_code_cell_value(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x: i64,
    y: i64,
    value: &str,
) {
    let sheet = grid_controller.sheet(sheet_id);
    let cell_value = sheet
        .edit_code_value(Pos { x, y }, grid_controller.a1_context())
        .unwrap();

    assert_eq!(
        value, cell_value.code_string,
        "Cell at ({}, {}) does not have the value {:?}, it's actually {:?}",
        x, y, value, cell_value.code_string
    );
}

/// Run an assertion that a cell value is equal to the given value
#[track_caller]
#[cfg(test)]
pub fn assert_data_table_cell_value(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x: i64,
    y: i64,
    value: &str,
) {
    let sheet = grid_controller.sheet(sheet_id);
    let pos = Pos { x, y };

    let cell_value = sheet
        .get_code_cell_value(pos)
        .map_or_else(|| CellValue::Blank, |v| CellValue::Text(v.to_string()));
    let expected_text_or_blank =
        |v: &CellValue| v == &CellValue::Text(value.into()) || v == &CellValue::Blank;

    assert!(
        expected_text_or_blank(&cell_value),
        "Cell at ({}, {}) does not have the value {:?}, it's actually {:?}",
        x,
        y,
        CellValue::Text(value.into()),
        cell_value
    );
}

// Run an assertion that cell values in a give column are equal to the given value
#[track_caller]
#[cfg(test)]
pub fn assert_cell_value_col(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x: i64,
    y_start: i64,
    y_end: i64,
    value: Vec<&str>,
) {
    for y in y_start..=y_end {
        assert_display_cell_value(
            grid_controller,
            sheet_id,
            x,
            y,
            value.get(y as usize).unwrap(),
        );
    }
}

/// Run an assertion that cell values in a given row are equal to the given value
#[track_caller]
#[cfg(test)]
pub fn assert_cell_value_row(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x_start: i64,
    x_end: i64,
    y: i64,
    value: Vec<&str>,
) {
    for (index, x) in (x_start..=x_end).enumerate() {
        if let Some(cell_value) = value.get(index) {
            assert_display_cell_value(grid_controller, sheet_id, x, y, cell_value);
        } else {
            panic!("No value at position ({},{})", index, y);
        }
    }
}

/// Run an assertion that cell values in a given row are equal to the given value
#[track_caller]
#[cfg(test)]
pub fn assert_data_table_cell_value_row(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x_start: i64,
    x_end: i64,
    y: i64,
    value: Vec<&str>,
) {
    for (index, x) in (x_start..=x_end).enumerate() {
        if let Some(cell_value) = value.get(index) {
            assert_data_table_cell_value(grid_controller, sheet_id, x, y, cell_value);
        } else {
            println!("No value at position ({},{})", index, y);
        }
    }
}

#[track_caller]
#[cfg(test)]
pub fn assert_data_table_cell_value_column(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x: i64,
    y_start: i64,
    y_end: i64,
    value: Vec<&str>,
) {
    for (index, y) in (y_start..=y_end).enumerate() {
        if let Some(cell_value) = value.get(index) {
            assert_data_table_cell_value(grid_controller, sheet_id, x, y, cell_value);
        } else {
            panic!("No value at position ({},{})", index, y);
        }
    }
}

#[track_caller]
#[cfg(test)]
pub fn assert_cell_format_bold_row(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x_start: i64,
    x_end: i64,
    y: i64,
    value: Vec<bool>,
) {
    for (index, x) in (x_start..=x_end).enumerate() {
        assert_cell_format_bold(
            grid_controller,
            sheet_id,
            x,
            y,
            *value.get(index).unwrap_or(&false),
        );
    }
}

#[track_caller]
#[cfg(test)]
pub fn assert_cell_format_bold(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x: i64,
    y: i64,
    expect_bold: bool,
) {
    let sheet = grid_controller.sheet(sheet_id);
    let has_bold = sheet.formats.bold.get(Pos { x, y });
    assert!(
        has_bold == Some(expect_bold) || (has_bold.is_none() && !expect_bold),
        "Cell at ({}, {}) should be bold={}, but is actually bold={}",
        x,
        y,
        expect_bold,
        has_bold.unwrap_or(false)
    );
}

// TODO(ddimaria): refactor all format assertions into a generic function
#[track_caller]
#[cfg(test)]
pub fn assert_cell_format_cell_fill_color_row(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x_start: i64,
    x_end: i64,
    y: i64,
    value: Vec<&str>,
) {
    for (index, x) in (x_start..=x_end).enumerate() {
        assert_cell_format_fill_color(
            grid_controller,
            sheet_id,
            x,
            y,
            value.get(index).unwrap().to_owned(),
        );
    }
}

#[track_caller]
#[cfg(test)]
pub fn assert_cell_format_fill_color(
    grid_controller: &GridController,
    sheet_id: SheetId,
    x: i64,
    y: i64,
    expect_fill_color: &str,
) {
    let sheet = grid_controller.sheet(sheet_id);
    let fill_color = sheet.formats.fill_color.get(Pos { x, y });
    assert!(
        fill_color == Some(expect_fill_color.to_string()),
        "Cell at ({}, {}) should be fill_color={:?}, but is actually fill_color={:?}",
        x,
        y,
        expect_fill_color,
        fill_color
    );
}

// Util to print a simple grid to assist in TDD
#[track_caller]
#[cfg(test)]
pub fn print_table(grid_controller: &GridController, sheet_id: SheetId, rect: Rect) {
    let Some(sheet) = grid_controller.try_sheet(sheet_id) else {
        println!("Sheet not found");
        return;
    };
    print_table_sheet(sheet, rect, true);
}

// Util to print a simple grid to assist in TDD
#[track_caller]
#[cfg(test)]
pub fn print_data_table(grid_controller: &GridController, sheet_id: SheetId, rect: Rect) {
    let sheet = grid_controller
        .try_sheet(sheet_id)
        .expect("Sheet not found");

    if let Some(data_table) = sheet.data_table_at(&rect.min) {
        let max = rect.max.y - rect.min.y + 1;
        crate::grid::data_table::test::pretty_print_data_table(
            data_table,
            None,
            Some(max as usize),
        );
    } else {
        println!("Data table not found at {:?}", rect.min);
    }
}

/// Util to print the entire sheet from the gc
#[track_caller]
#[cfg(test)]
pub fn print_first_sheet(gc: &GridController) {
    if let Some(sheet) = gc.try_sheet(gc.sheet_ids()[0]) {
        print_sheet(sheet);
    } else {
        println!("Sheet not found");
    }
}

/// Util to print the entire sheet
#[track_caller]
#[cfg(test)]
pub fn print_sheet(sheet: &Sheet) {
    let bounds = sheet.bounds(true);
    if let GridBounds::NonEmpty(rect) = bounds {
        print_table_sheet(sheet, rect, true);
    } else {
        println!("Sheet is empty");
    }
}

/// Util to print a simple grid to assist in TDD
#[track_caller]
#[cfg(test)]
pub fn print_table_sheet(sheet: &Sheet, rect: Rect, display_cell_values: bool) {
    let mut vals = vec![];
    let mut builder = Builder::default();
    let columns = (rect.x_range())
        .map(|i| i.to_string())
        .collect::<Vec<String>>();
    let mut blank = vec!["".to_string()];
    blank.extend(columns.clone());
    builder.set_header(blank);
    let mut bolds = vec![];
    let mut fill_colors = vec![];
    let mut count_x = 0;
    let mut count_y = 0;
    // `self.a1_context()` is unaware of other sheets, which might cause issues?
    let parse_ctx = sheet.make_a1_context();

    // convert the selected range in the sheet to tabled
    rect.y_range().for_each(|y| {
        vals.push(y.to_string());
        rect.x_range().for_each(|x| {
            let pos: Pos = Pos { x, y };

            if sheet.formats.bold.get(pos).is_some_and(|bold| bold) {
                bolds.push((count_y + 1, count_x + 1));
            }

            if let Some(fill_color) = sheet.formats.fill_color.get(pos) {
                fill_colors.push((count_y + 1, count_x + 1, fill_color));
            }

            let cell_value = match display_cell_values {
                true => sheet.cell_value(pos),
                false => sheet
                    .data_table_at(&rect.min)
                    .unwrap_or_else(|| panic!("Data table not found at {:?}", rect.min))
                    .cell_value_at(x as u32, y as u32),
            };

            let cell_value = match cell_value {
                Some(CellValue::Code(code_cell)) => match code_cell.language {
                    CodeCellLanguage::Formula => convert_rc_to_a1(
                        &code_cell.code.to_string(),
                        &parse_ctx,
                        pos.to_sheet_pos(sheet.id),
                    ),
                    CodeCellLanguage::Python => code_cell.code.to_string(),
                    CodeCellLanguage::Connection { .. } => code_cell.code.to_string(),
                    CodeCellLanguage::Javascript => code_cell.code.to_string(),
                    CodeCellLanguage::Import => "import".to_string(),
                },
                Some(CellValue::Import(import)) => import.to_string(),
                _ => sheet
                    .display_value(pos)
                    .unwrap_or(CellValue::Blank)
                    .to_string(),
            };

            vals.push(cell_value);
            count_x += 1;
        });
        builder.push_record(vals.clone());
        vals.clear();
        count_x = 0;
        count_y += 1;
    });

    let mut table = builder.build();
    table.with(Style::modern());

    // apply bold values to the table
    bolds.iter().for_each(|coords| {
        table.with(
            Modify::new((coords.0, coords.1))
                .with(Color::BOLD)
                .with(Color::FG_BRIGHT_RED),
        );
    });

    // limited supported color set
    let bg_colors = HashMap::<&str, Color>::from_iter([
        ("white", Color::BG_WHITE),
        ("red", Color::BG_RED),
        ("blue", Color::BG_BLUE),
        ("green", Color::BG_GREEN),
        ("yellow", Color::BG_BRIGHT_YELLOW),
    ]);

    // apply fill color values to the table
    fill_colors.iter().for_each(|(x, y, fill_color)| {
        let color = bg_colors
            .get(fill_color.as_str())
            .unwrap_or(&Color::BG_WHITE)
            .to_owned();
        table.with(Colorization::exact([color], (*x, *y)));
    });

    println!("\nsheet: {}\n{}", sheet.id, table);
}

/// Prints the order of the data_tables to the console.
#[cfg(test)]
pub fn print_data_table_order(sheet: &Sheet) {
    dbgjs!(
        sheet
            .data_tables
            .iter()
            .map(|(pos, _)| pos)
            .collect::<Vec<_>>()
    );
}

// prints formatting for table
#[cfg(test)]
pub fn print_table_sheet_formats(sheet: &Sheet, rect: Rect) {
    let mut builder = Builder::default();
    let columns = (rect.x_range())
        .map(|i| i.to_string())
        .collect::<Vec<String>>();
    let mut blank = vec!["".to_string()];
    blank.extend(columns.clone());
    builder.set_header(blank);

    for y in rect.y_range() {
        let mut vals = vec![y.to_string()];
        for x in rect.x_range() {
            let format = sheet.formats.format(Pos { x, y });
            vals.push(format.to_string());
        }
        builder.push_record(vals);
    }
    let mut table = builder.build();
    table.with(Style::modern());

    println!("\nsheet: {}\n{}", sheet.id, table);
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn print_table_sheet_format() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet = gc.sheet_mut(sheet_id);
        sheet.formats.bold.set(pos![A1], Some(true));
        sheet.formats.bold.set(pos![B2], Some(true));
        sheet.formats.italic.set(pos![A2], Some(true));
        sheet
            .formats
            .fill_color
            .set(pos![B3], Some("blue".to_string()));
        sheet
            .formats
            .fill_color
            .set(pos![C3], Some("green".to_string()));
        print_table_sheet_formats(sheet, Rect::test_a1("A1:C3"));
    }

    #[test]
    fn test_assert_cell_value() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet = gc.sheet_mut(sheet_id);

        // Set up a test cell
        sheet.set_cell_value(pos![A1], CellValue::Text("test".to_string()));

        // Test the assertion passes when values match
        assert_cell_value(&gc, sheet_id, 1, 1, CellValue::Text("test".to_string()));
    }

    #[test]
    fn test_assert_display_cell_value() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet = gc.sheet_mut(sheet_id);

        // Set up a test cell
        sheet.set_cell_value(pos![A1], CellValue::Text("display test".to_string()));

        // Test the assertion passes when values match
        assert_display_cell_value(&gc, sheet_id, 0, 0, "display test");
    }

    #[test]
    fn test_assert_cell_value_row() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet = gc.sheet_mut(sheet_id);

        // Set up a row of test cells
        sheet.set_cell_value(pos![A1], CellValue::Text("one".to_string()));
        sheet.set_cell_value(pos![B1], CellValue::Text("two".to_string()));
        sheet.set_cell_value(pos![C1], CellValue::Text("three".to_string()));

        // Test the assertion passes for a row
        assert_cell_value_row(&gc, sheet_id, 0, 2, 0, vec!["one", "two", "three"]);
    }

    #[test]
    fn test_str_vec_to_string_vec() {
        let input = vec!["test", "convert", "strings"];
        let result = str_vec_to_string_vec(&input);
        assert_eq!(
            result,
            vec![
                "test".to_string(),
                "convert".to_string(),
                "strings".to_string()
            ]
        );
    }

    #[test]
    fn test_assert_cell_format_bold() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet = gc.sheet_mut(sheet_id);

        // Set bold formatting
        sheet.formats.bold.set(pos![A1], Some(true));

        // Test the assertion passes when bold is set
        assert_cell_format_bold(&gc, sheet_id, 1, 1, true);
        // Test the assertion passes when bold is not set
        assert_cell_format_bold(&gc, sheet_id, 1, 2, false);
    }
}
