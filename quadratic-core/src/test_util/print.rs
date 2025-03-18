use crate::grid::data_table::DataTable;
use crate::{
    controller::GridController,
    formulas::convert_rc_to_a1,
    grid::{CodeCellLanguage, GridBounds, Sheet, SheetId},
    CellValue, Pos, Rect,
};

use std::collections::HashMap;

use tabled::{
    builder::Builder,
    settings::{themes::Colorization, Color},
    settings::{Modify, Style},
};

/// Util to print a data table when testing
#[track_caller]
pub fn pretty_print_data_table(data_table: &DataTable, title: Option<&str>, max: Option<usize>) {
    let data_table = output_pretty_print_data_table(data_table, title, max);
    println!("{}", data_table);
}

/// Returns a String for a pretty print of a data table for testing
#[track_caller]
pub fn output_pretty_print_data_table(
    data_table: &DataTable,
    title: Option<&str>,
    max: Option<usize>,
) -> String {
    if data_table.is_single_value() {
        let value = data_table.cell_value_at(0, 0).unwrap();
        return format!(
            "{title} with single value: {value}",
            title = title.unwrap_or("Data Table"),
            value = value
        );
    }

    let mut builder = Builder::default();
    let array = data_table
        .display_value(false)
        .unwrap()
        .into_array()
        .unwrap();
    let max = max.unwrap_or(array.height() as usize);
    let title = title.unwrap_or("Data Table");
    let display_buffer = data_table
        .display_buffer
        .clone()
        .unwrap_or((0..array.height() as u64).collect::<Vec<_>>());

    for (index, row) in array.rows().take(max).enumerate() {
        let row = row.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let display_index = vec![display_buffer[index].to_string()];

        if index == 0 && data_table.column_headers.is_some() && data_table.show_columns {
            let headers = data_table
                .column_headers
                .as_ref()
                .unwrap()
                .iter()
                .filter(|h| h.display)
                .map(|h| h.name.to_string())
                .collect::<Vec<_>>();
            builder.set_header([display_index, headers].concat());
        } else if index == 0 && data_table.header_is_first_row && data_table.show_columns {
            let row = [display_index, row].concat();
            builder.set_header(row);
        } else {
            let row = [display_index, row].concat();
            builder.push_record(row);
        }
    }

    let mut table = builder.build();
    table.with(Style::modern());

    // bold the headers if they exist
    if data_table.header_is_first_row {
        table.with(Modify::new((0, 0)).with(Color::BOLD));

        (0..table.count_columns())
            .collect::<Vec<usize>>()
            .iter()
            .enumerate()
            .for_each(|(index, _)| {
                table.with(Modify::new((0, index + 1)).with(Color::BOLD));
            });
    }

    format!("\nData Table: {title}\n{table}")
}

// Util to print a data table given its anchor position
#[track_caller]
pub fn print_table_at(gc: &GridController, sheet_id: SheetId, pos: Pos) {
    let sheet = gc.try_sheet(sheet_id).expect("Sheet not found");
    let data_table = sheet.data_table(pos).expect("Data table not found");
    pretty_print_data_table(&data_table, None, None);
}

// Util to print a simple grid to assist in TDD
#[track_caller]
pub fn print_table_in_rect(grid_controller: &GridController, sheet_id: SheetId, rect: Rect) {
    let sheet = grid_controller
        .try_sheet(sheet_id)
        .expect("Sheet not found");

    if let Some(data_table) = sheet.data_table(rect.min) {
        let max = rect.max.y - rect.min.y + 1;
        pretty_print_data_table(data_table, None, Some(max as usize));
    } else {
        println!("Data table not found at {:?}", rect.min);
    }
}

/// Util to print the entire sheet from the gc
#[track_caller]
pub fn print_first_sheet(gc: &GridController) {
    if let Some(sheet) = gc.try_sheet(gc.sheet_ids()[0]) {
        print_sheet(sheet);
    } else {
        println!("Sheet not found");
    }
}

/// Util to print the entire sheet
#[track_caller]
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
    let parse_ctx = sheet.a1_context();

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
                    .data_table(rect.min)
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
pub fn print_data_table_order(sheet: &Sheet) {
    dbgjs!(sheet
        .data_tables
        .iter()
        .map(|(pos, _)| pos)
        .collect::<Vec<_>>());
}

// prints formatting for table
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
mod tests {
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
}
