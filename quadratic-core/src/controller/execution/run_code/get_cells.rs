use uuid::Uuid;

use crate::{
    controller::{execution::TransactionType, GridController},
    error_core::CoreError,
    Rect,
};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "js", derive(ts_rs::TS))]
pub struct JsGetCellResponse {
    pub x: i64,
    pub y: i64,
    pub value: String,
    pub type_name: String,
}

impl GridController {
    /// This is used to get cells during an async calculation.
    #[allow(clippy::result_large_err)]
    pub fn calculation_get_cells(
        &mut self,
        transaction_id: String,
        rect: Rect,
        sheet_name: Option<String>,
        line_number: Option<u32>,
    ) -> Result<Vec<JsGetCellResponse>, CoreError> {
        let Ok(transaction_id) = Uuid::parse_str(&transaction_id) else {
            return Err(CoreError::TransactionNotFound(
                "Transaction Id is invalid".into(),
            ));
        };
        let Ok(mut transaction) = self.transactions.remove_awaiting_async(transaction_id) else {
            return Err(CoreError::TransactionNotFound(
                "Transaction Id not found".into(),
            ));
        };

        let current_sheet = if let Some(current_sheet_pos) = transaction.current_sheet_pos {
            current_sheet_pos.sheet_id
        } else {
            return Err(CoreError::TransactionNotFound(
                "Transaction's position not found".to_string(),
            ));
        };

        // if sheet_name is None, use the sheet_id from the pos
        let sheet = if let Some(sheet_name) = sheet_name {
            if let Some(sheet) = self.try_sheet_from_name(sheet_name.clone()) {
                sheet
            } else {
                // unable to find sheet by name, generate error
                let msg = if let Some(line_number) = line_number {
                    format!("Sheet '{}' not found at line {}", sheet_name, line_number)
                } else {
                    format!("Sheet '{}' not found", sheet_name)
                };
                match self.code_cell_sheet_error(&mut transaction, msg.clone(), line_number) {
                    Ok(_) => {
                        self.start_transaction(&mut transaction);
                        self.finalize_transaction(&mut transaction);
                        return Err(CoreError::CodeCellSheetError(msg));
                    }
                    Err(err) => {
                        self.start_transaction(&mut transaction);
                        self.finalize_transaction(&mut transaction);
                        return Err(err);
                    }
                }
            }
        } else if let Some(sheet) = self.try_sheet(current_sheet) {
            sheet
        } else {
            self.start_transaction(&mut transaction);
            self.finalize_transaction(&mut transaction);
            return Err(CoreError::CodeCellSheetError("Sheet not found".to_string()));
        };

        let transaction_type = transaction.transaction_type.clone();
        if transaction_type != TransactionType::User {
            // this should only be called for a user transaction
            return Err(CoreError::TransactionNotFound(
                "getCells can only be called for non-user transaction".to_string(),
            ));
        }
        let response = sheet.get_cells_response(rect);
        transaction
            .cells_accessed
            .insert(rect.to_sheet_rect(sheet.id));
        self.transactions.add_async_transaction(&transaction);
        Ok(response)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::{grid::CodeCellLanguage, Pos, Rect, SheetPos};

    #[test]
    fn test_calculation_get_cells_bad_transaction_id() {
        let mut gc = GridController::test();

        let result = gc.calculation_get_cells(
            "bad transaction id".to_string(),
            Rect::from_numbers(0, 0, 1, 1),
            None,
            None,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_calculation_get_cells_no_transaction() {
        let mut gc = GridController::test();

        let result = gc.calculation_get_cells(
            Uuid::new_v4().to_string(),
            Rect::from_numbers(0, 0, 1, 1),
            None,
            None,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_calculation_get_cells_transaction_but_no_current_sheet_pos() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        gc.set_code_cell(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            CodeCellLanguage::Python,
            "".to_string(),
            None,
        );

        let transactions = gc.transactions.async_transactions_mut();
        transactions[0].current_sheet_pos = None;
        let transaction_id = transactions[0].id.to_string();
        let result =
            gc.calculation_get_cells(transaction_id, Rect::from_numbers(0, 0, 1, 1), None, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_calculation_get_cells_sheet_name_not_found() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        gc.set_code_cell(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            CodeCellLanguage::Python,
            "".to_string(),
            None,
        );
        let transaction_id = gc.last_transaction().unwrap().id;

        let result = gc.calculation_get_cells(
            transaction_id.to_string(),
            Rect::from_numbers(0, 0, 1, 1),
            Some("bad sheet name".to_string()),
            None,
        );
        assert!(result.is_err());
        let sheet = gc.sheet(sheet_id);
        let error = sheet
            .code_run(Pos { x: 0, y: 0 })
            .unwrap()
            .clone()
            .std_err
            .unwrap();
        assert!(error.contains("not found"));
    }

    // This was previously disallowed. It is now allowed to unlock appending results.
    // Leaving in some commented out code in case we want to revert this behavior.
    #[test]
    fn test_calculation_get_cells_self_reference() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];

        gc.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "10".to_string(),
            None,
        );
        // async python
        gc.set_code_cell(
            SheetPos {
                x: 0,
                y: 1,
                sheet_id,
            },
            crate::grid::CodeCellLanguage::Python,
            "".to_string(),
            None,
        );
        let transaction_id = gc.last_transaction().unwrap().id;

        let result = gc.calculation_get_cells(
            transaction_id.to_string(),
            Rect::from_numbers(0, 1, 1, 1),
            None,
            None,
        );
        assert!(result.is_ok());

        let sheet = gc.sheet(sheet_id);
        let code = sheet.get_render_cells(Rect::from_numbers(0, 1, 1, 1));
        assert_eq!(code.len(), 0);
        // assert_eq!(code[0].special, Some(JsRenderCellSpecial::RunError));
        // let sheet = gc.sheet(sheet_id);
        // let error = sheet
        //     .code_run(Pos { x: 0, y: 1 })
        //     .unwrap()
        //     .clone()
        //     .std_err
        //     .unwrap();
        // assert!(error.is_empty());
    }

    #[test]
    fn test_calculation_get_cells() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];

        gc.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "test".to_string(),
            None,
        );

        gc.set_code_cell(
            SheetPos {
                x: 1,
                y: 1,
                sheet_id,
            },
            CodeCellLanguage::Python,
            "".to_string(),
            None,
        );
        let transaction_id = gc.last_transaction().unwrap().id;

        let result = gc.calculation_get_cells(
            transaction_id.to_string(),
            Rect::from_numbers(0, 0, 1, 1),
            None,
            None,
        );
        assert_eq!(
            result,
            Ok(vec![JsGetCellResponse {
                x: 0,
                y: 0,
                value: "test".into(),
                type_name: "text".into()
            }])
        );
    }
}
