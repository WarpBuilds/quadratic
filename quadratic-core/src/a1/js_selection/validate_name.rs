use std::str::FromStr;

use wasm_bindgen::prelude::*;

use crate::grid::SheetId;

use super::{A1Context, DataTable, Sheet};

#[wasm_bindgen(js_name = "validateSheetName")]
pub fn js_validate_sheet_name(name: &str, sheet_id: &str, context: &str) -> Result<bool, String> {
    let sheet_id = SheetId::from_str(sheet_id).map_err(|e| e.to_string())?;
    let context = serde_json::from_str::<A1Context>(context).map_err(|e| e.to_string())?;
    Sheet::validate_sheet_name(name, sheet_id, &context)
}

#[wasm_bindgen(js_name = "validateTableName")]
pub fn js_validate_table_name(name: &str, context: &str) -> Result<bool, String> {
    let context = serde_json::from_str::<A1Context>(context).map_err(|e| e.to_string())?;
    DataTable::validate_table_name(name, &context)
}

#[wasm_bindgen(js_name = "validateColumnName")]
pub fn jsvalidate_column_name(
    table_name: &str,
    column_name: &str,
    context: &str,
) -> Result<bool, String> {
    let context = serde_json::from_str::<A1Context>(context).map_err(|e| e.to_string())?;
    DataTable::validate_column_name(table_name, column_name, &context)
}
