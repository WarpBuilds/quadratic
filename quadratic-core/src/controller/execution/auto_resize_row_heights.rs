use uuid::Uuid;

use super::GridController;
use crate::controller::active_transactions::pending_transaction::PendingTransaction;
use crate::controller::operations::operation::Operation;
use crate::error_core::Result;
use crate::grid::js_types::JsRowHeight;
use crate::grid::SheetId;

impl GridController {
    pub fn start_auto_resize_row_heights(
        &mut self,
        transaction: &mut PendingTransaction,
        sheet_id: SheetId,
        rows: Vec<i64>,
    ) -> bool {
        if (!cfg!(target_family = "wasm") && !cfg!(test))
            || !transaction.is_user()
            || rows.is_empty()
        {
            return false;
        }

        if let Some(sheet) = self.try_sheet(sheet_id) {
            let mut auto_resize_rows = sheet.get_auto_resize_rows(rows);
            if auto_resize_rows.is_empty() {
                return false;
            }
            auto_resize_rows.sort();
            if let Ok(rows_string) = serde_json::to_string(&auto_resize_rows) {
                crate::wasm_bindings::js::jsRequestRowHeights(
                    transaction.id.to_string(),
                    sheet_id.to_string(),
                    rows_string,
                );
                // don't add_async_transaction in test mode,
                // as we will not receive renderer callback during tests and the transaction will never complete
                if !cfg!(test) {
                    self.transactions.add_async_transaction(transaction);
                    return true;
                }
            } else {
                dbgjs!("[control_transactions] start_auto_resize_row_heights: Failed to serialize auto resize rows");
            }
        } else {
            dbgjs!("[control_transactions] start_auto_resize_row_heights: Sheet not found");
        }
        false
    }

    pub fn complete_auto_resize_row_heights(
        &mut self,
        transaction_id: Uuid,
        sheet_id: SheetId,
        row_heights: Vec<JsRowHeight>,
    ) -> Result<()> {
        let mut transaction = self.transactions.remove_awaiting_async(transaction_id)?;
        if !row_heights.is_empty() {
            transaction.operations.push_back(Operation::ResizeRows {
                sheet_id,
                row_heights,
            });
        }
        self.start_transaction(&mut transaction);
        self.finalize_transaction(&mut transaction);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use bigdecimal::BigDecimal;
    use serial_test::serial;

    use crate::controller::active_transactions::pending_transaction::PendingTransaction;
    use crate::controller::execution::run_code::get_cells::JsGetCellResponse;
    use crate::controller::operations::operation::Operation;
    use crate::controller::transaction_types::JsCodeResult;
    use crate::controller::GridController;
    use crate::grid::formats::format_update::FormatUpdate;
    use crate::grid::formats::Formats;
    use crate::grid::js_types::JsRowHeight;
    use crate::grid::{
        CellAlign, CellVerticalAlign, CellWrap, CodeCellLanguage, NumericFormat, NumericFormatKind,
        RenderSize, SheetId,
    };
    use crate::selection::Selection;
    use crate::sheet_offsets::resize_transient::TransientResize;
    use crate::wasm_bindings::js::{clear_js_calls, expect_js_call, expect_js_call_count};
    use crate::{CellValue, Pos, SheetPos, SheetRect};

    fn mock_auto_resize_row_heights(
        gc: &mut GridController,
        sheet_id: SheetId,
        ops: Vec<Operation>,
        row_heights: Vec<JsRowHeight>, // mock response from renderer
    ) {
        let mut transaction = PendingTransaction {
            operations: ops.into(),
            ..Default::default()
        };
        let has_async = transaction.has_async;
        // manually add async transaction, as this is disabled in test mode by default
        gc.transactions.add_async_transaction(&mut transaction);
        assert_eq!(transaction.has_async, has_async + 1);

        gc.start_transaction(&mut transaction);

        // mock callback from renderer
        let _ = gc.complete_auto_resize_row_heights(transaction.id, sheet_id, row_heights);
    }

    #[test]
    #[serial]
    fn test_auto_resize_row_heights_on_set_cell_value() {
        clear_js_calls();
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet_pos = SheetPos {
            x: 0,
            y: 0,
            sheet_id,
        };
        gc.set_cell_wrap(sheet_pos.into(), Some(CellWrap::Wrap), None);
        let ops = gc.set_cell_value_operations(
            sheet_pos,
            "test_auto_resize_row_heights_on_set_cell_value_1".to_string(),
        );
        // mock response from renderer
        let row_heights = vec![JsRowHeight {
            row: 0,
            height: 40f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops.clone(), row_heights.clone());

        assert_eq!(
            gc.sheet(sheet_id).display_value(sheet_pos.into()),
            Some(CellValue::Text(
                "test_auto_resize_row_heights_on_set_cell_value_1".to_string()
            ))
        );
        // should trigger auto resize row heights and request row heights from renderer
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[0]"),
            false,
        );

        // should resize row 0 to 40, as per mock response from renderer
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(0), 40f64);

        // should send resized row heights to renderer and client
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // transaction should be completed
        let async_transaction = gc.transactions.get_async_transaction(transaction_id);
        assert!(async_transaction.is_err());

        let ops = gc.set_cell_value_operations(
            sheet_pos,
            "test_auto_resize_row_heights_on_set_cell_value_2".to_string(),
        );
        let row_heights = vec![JsRowHeight {
            row: 0,
            height: 40f64,
        }];
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        // should trigger auto resize row heights and request row heights from renderer
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[0]"),
            false,
        );
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(0), 40f64);
        // new row height same as previous, should not trigger jsResizeRowHeights
        expect_js_call_count("jsResizeRowHeights", 0, true);

        // transaction should be completed
        let async_transaction = gc.transactions.get_async_transaction(transaction_id);
        assert!(async_transaction.is_err());
    }

    #[test]
    #[serial]
    fn test_auto_resize_row_heights_on_set_cell_format() {
        clear_js_calls();
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];

        gc.set_cell_values(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            vec![
                vec!["0"],
                vec!["1"],
                vec!["2"],
                vec!["3"],
                vec!["4"],
                vec!["5"],
                vec!["6"],
                vec!["7"],
            ],
            None,
        );
        gc.set_cell_wrap(
            SheetRect {
                min: Pos { x: 0, y: 0 },
                max: Pos { x: 0, y: 10 },
                sheet_id,
            },
            Some(CellWrap::Wrap),
            None,
        );

        // should trigger auto resize row heights for wrap
        let ops = vec![Operation::SetCellFormatsSelection {
            selection: Selection::pos(0, 0, sheet_id),
            formats: Formats::repeat(
                FormatUpdate {
                    wrap: Some(Some(CellWrap::Overflow)),
                    ..FormatUpdate::default()
                },
                1,
            ),
        }];
        let row_heights = vec![JsRowHeight {
            row: 0,
            height: 40f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[0]"),
            false,
        );
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(0), 40f64);
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // should trigger auto resize row heights for numeric format
        let ops = vec![Operation::SetCellFormatsSelection {
            selection: Selection::pos(0, 1, sheet_id),
            formats: Formats::repeat(
                FormatUpdate {
                    numeric_format: Some(Some(NumericFormat {
                        kind: NumericFormatKind::Currency,
                        symbol: None,
                    })),
                    ..FormatUpdate::default()
                },
                1,
            ),
        }];
        let row_heights = vec![JsRowHeight {
            row: 1,
            height: 41f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[1]"),
            false,
        );
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(1), 41f64);
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // should trigger auto resize row heights for numeric decimals
        let ops = vec![Operation::SetCellFormatsSelection {
            selection: Selection::pos(0, 2, sheet_id),
            formats: Formats::repeat(
                FormatUpdate {
                    numeric_decimals: Some(Some(2)),
                    ..FormatUpdate::default()
                },
                1,
            ),
        }];
        let row_heights = vec![JsRowHeight {
            row: 2,
            height: 42f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[2]"),
            false,
        );
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(2), 42f64);
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // should trigger auto resize row heights for numeric commas
        let ops = vec![Operation::SetCellFormatsSelection {
            selection: Selection::pos(0, 3, sheet_id),
            formats: Formats::repeat(
                FormatUpdate {
                    numeric_commas: Some(Some(true)),
                    ..FormatUpdate::default()
                },
                1,
            ),
        }];
        let row_heights = vec![JsRowHeight {
            row: 3,
            height: 43f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[3]"),
            false,
        );
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(3), 43f64);
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // should trigger auto resize row heights for bold
        let ops = vec![Operation::SetCellFormatsSelection {
            selection: Selection::pos(0, 4, sheet_id),
            formats: Formats::repeat(
                FormatUpdate {
                    bold: Some(Some(true)),
                    ..FormatUpdate::default()
                },
                1,
            ),
        }];
        let row_heights = vec![JsRowHeight {
            row: 4,
            height: 44f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[4]"),
            false,
        );
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(4), 44f64);
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // should trigger auto resize row heights for italic
        let ops = vec![Operation::SetCellFormatsSelection {
            selection: Selection::pos(0, 5, sheet_id),
            formats: Formats::repeat(
                FormatUpdate {
                    italic: Some(Some(true)),
                    ..FormatUpdate::default()
                },
                1,
            ),
        }];
        let row_heights = vec![JsRowHeight {
            row: 5,
            height: 45f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[5]"),
            false,
        );
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(5), 45f64);
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // should not trigger auto resize row heights for other formats
        let ops = vec![Operation::SetCellFormatsSelection {
            selection: Selection::pos(1, 0, sheet_id),
            formats: Formats::repeat(
                FormatUpdate {
                    align: Some(Some(CellAlign::Center)),
                    vertical_align: Some(Some(CellVerticalAlign::Middle)),
                    text_color: Some(Some("red".to_string())),
                    fill_color: Some(Some("blue".to_string())),
                    render_size: Some(Some(RenderSize {
                        w: "1".to_string(),
                        h: "2".to_string(),
                    })),
                    ..FormatUpdate::default()
                },
                1,
            ),
        }];
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, vec![]);
        expect_js_call_count("jsRequestRowHeights", 0, false);
        expect_js_call_count("jsResizeRowHeights", 0, false);

        // transaction should be completed
        let async_transaction = gc.transactions.get_async_transaction(transaction_id);
        assert!(async_transaction.is_err());
    }

    #[test]
    #[serial]
    fn test_auto_resize_row_heights_on_compute_code_formula() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet_pos = SheetPos {
            x: 0,
            y: 0,
            sheet_id,
        };
        gc.set_cell_wrap(sheet_pos.into(), Some(CellWrap::Wrap), None);
        gc.set_code_cell(
            sheet_pos,
            CodeCellLanguage::Formula,
            "1+1".to_string(),
            None,
        );
        clear_js_calls();

        let ops = vec![Operation::ComputeCode { sheet_pos }];
        let row_heights = vec![JsRowHeight {
            row: 0,
            height: 40f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[0]"),
            false,
        );
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(0), 40f64);
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // transaction should be completed
        let async_transaction = gc.transactions.get_async_transaction(transaction_id);
        assert!(async_transaction.is_err());
    }

    #[test]
    #[serial]
    fn test_auto_resize_row_heights_on_compute_code_python() {
        clear_js_calls();

        // run 2 async operations in a transaction
        // run_python & resize_row_heights

        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet_pos = SheetPos {
            x: 0,
            y: 1,
            sheet_id,
        };

        gc.set_cell_wrap(sheet_pos.into(), Some(CellWrap::Wrap), None);

        // python code cell
        gc.set_cell_value(
            SheetPos {
                x: 0,
                y: 0,
                sheet_id,
            },
            "9".into(),
            None,
        );
        let code = "c(0, 0) + 1".to_string();
        let ops = gc.set_code_cell_operations(sheet_pos, CodeCellLanguage::Python, code.clone());

        // resize rows
        let row_heights = vec![JsRowHeight {
            row: 0,
            height: 40f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(0), 21f64);

        let transaction = gc.async_transactions().first().unwrap();
        assert_eq!(transaction.has_async, 1);
        let transaction_id = transaction.id;

        let cells =
            gc.calculation_get_cells(transaction_id.to_string(), 0, 0, 1, Some(1), None, None);
        assert!(cells.is_ok());
        assert_eq!(
            cells,
            Ok(vec![JsGetCellResponse {
                x: 0,
                y: 0,
                value: "9".into(),
                type_name: "number".into(),
            }])
        );
        // pending cal
        let transaction = gc.async_transactions().first().unwrap();
        assert_eq!(transaction.has_async, 1);

        assert!(gc
            .calculation_complete(JsCodeResult::new(
                transaction_id.to_string(),
                true,
                None,
                None,
                Some(vec!["10".into(), "number".into()]),
                None,
                None,
                None,
                None,
            ))
            .is_ok());
        let sheet = gc.try_sheet(sheet_id).unwrap();
        assert_eq!(
            sheet.display_value(Pos { x: 0, y: 1 }),
            Some(CellValue::Number(BigDecimal::from(10)))
        );

        expect_js_call(
            "jsRunPython",
            format!("{},{},{},{},{}", transaction_id, 0, 1, sheet_id, code),
            false,
        );
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[1]"),
            false,
        );
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // row resized to 40
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(0), 40f64);

        // transaction should be completed
        let async_transaction = gc.transactions.get_async_transaction(transaction_id);
        assert!(async_transaction.is_err());
    }

    #[test]
    #[serial]
    fn test_auto_resize_row_heights_on_offset_resize() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet_pos = SheetPos {
            x: 0,
            y: 0,
            sheet_id,
        };
        gc.set_cell_values(
            sheet_pos,
            vec![vec!["zero"], vec!["one"], vec!["two"], vec!["three"]],
            None,
        );
        gc.set_cell_wrap(
            SheetRect {
                min: Pos { x: 0, y: 0 },
                max: Pos { x: 0, y: 10 },
                sheet_id,
            },
            Some(CellWrap::Wrap),
            None,
        );

        // set row 1 to Manually resized
        gc.commit_offsets_resize(
            sheet_id,
            TransientResize {
                row: Some(1),
                column: None,
                old_size: gc.sheet(sheet_id).offsets.row_height(1),
                new_size: 40.0,
            },
            None,
        );

        clear_js_calls();

        // resize column 0 should trigger auto resize row heights for rows 0, 2, 3
        let ops = vec![Operation::ResizeColumn {
            sheet_id,
            column: 0,
            new_size: 120.0,
            client_resized: (true),
        }];
        let row_heights = vec![JsRowHeight {
            row: 0,
            height: 41f64,
        }];
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops.clone(), row_heights.clone());

        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[0,2,3]"),
            true,
        );

        // set row 1 to Auto resized
        gc.commit_single_resize(sheet_id, None, Some(1), 25f64, None);

        // resize column 0 should trigger auto resize row heights for rows 0, 1, 2, 3
        let ops = vec![Operation::ResizeColumn {
            sheet_id,
            column: 0,
            new_size: 100.0,
            client_resized: (true),
        }];
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops, row_heights);
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[0,1,2,3]"),
            true,
        );

        // transaction should be completed
        let async_transaction = gc.transactions.get_async_transaction(transaction_id);
        assert!(async_transaction.is_err());
    }

    #[test]
    #[serial]
    fn test_auto_resize_row_heights_on_user_transaction_only() {
        clear_js_calls();
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet_pos = SheetPos {
            x: 0,
            y: 0,
            sheet_id,
        };
        gc.set_cell_wrap(sheet_pos.into(), Some(CellWrap::Wrap), None);
        let ops = gc.set_cell_value_operations(
            sheet_pos,
            "test_auto_resize_row_heights_on_user_transaction_only".to_string(),
        );
        // mock response from renderer
        let row_heights = vec![JsRowHeight {
            row: 0,
            height: 40f64,
        }];
        let row_heights_string = serde_json::to_string(&row_heights).unwrap();
        mock_auto_resize_row_heights(&mut gc, sheet_id, ops.clone(), row_heights);
        assert_eq!(
            gc.sheet(sheet_id).display_value(sheet_pos.into()),
            Some(CellValue::Text(
                "test_auto_resize_row_heights_on_user_transaction_only".to_string()
            ))
        );
        let transaction_id = gc.last_transaction().unwrap().id;
        expect_js_call(
            "jsRequestRowHeights",
            format!("{},{},{}", transaction_id, sheet_id, "[0]"),
            false,
        );
        assert_eq!(gc.sheet(sheet_id).offsets.row_height(0), 40f64);
        expect_js_call(
            "jsResizeRowHeights",
            format!("{},{}", sheet_id, row_heights_string),
            true,
        );

        // should not trigger auto resize row heights for undo / redo transaction
        gc.undo(None);
        gc.redo(None);
        expect_js_call_count("jsRequestRowHeights", 0, false);

        // should not trigger auto resize row heights for multiplayer transactions
        let mut other_gc = GridController::test();
        other_gc.grid_mut().sheets_mut()[0].id = sheet_id;
        other_gc.received_transaction(transaction_id, 1, ops);
        let sheet = other_gc.sheet(sheet_id);
        assert_eq!(
            sheet.display_value(Pos { x: 0, y: 0 }),
            Some(CellValue::Text(
                "test_auto_resize_row_heights_on_user_transaction_only".to_string()
            ))
        );
        expect_js_call_count("jsRequestRowHeights", 0, true);

        // transaction should be completed
        let async_transaction = gc.transactions.get_async_transaction(transaction_id);
        assert!(async_transaction.is_err());
    }

    #[test]
    #[serial]
    fn test_transaction_save_when_auto_resize_row_heights_when_not_executed() {
        let mut gc = GridController::test();
        let sheet_id = gc.sheet_ids()[0];
        let sheet_pos = SheetPos {
            x: 0,
            y: 0,
            sheet_id,
        };
        // set wrap
        gc.set_cell_wrap(sheet_pos.into(), Some(CellWrap::Wrap), None);

        // manually resize row 0
        gc.commit_offsets_resize(
            sheet_id,
            TransientResize {
                row: Some(0),
                column: None,
                old_size: gc.sheet(sheet_id).offsets.row_height(0),
                new_size: 40.0,
            },
            None,
        );

        let prev_transaction_id = gc.last_transaction().unwrap().id;

        clear_js_calls();
        // set cell value, should not trigger auto resize row heights because manually resized
        gc.set_cell_value(
            sheet_pos,
            "test_auto_resize_row_heights_on_user_transaction_only".to_string(),
            None,
        );
        // confirm no auto resize row heights call
        expect_js_call_count("jsRequestRowHeights", 0, true);

        let next_transaction = gc.last_transaction().unwrap();

        // confirm new transaction save
        assert_ne!(prev_transaction_id, next_transaction.id);

        // confirm new transaction has set cell value operation
        assert!(matches!(
            next_transaction.operations[0],
            Operation::SetCellValues { .. }
        ));

        // confirm no pending async transaction
        let async_transaction = gc.transactions.get_async_transaction(next_transaction.id);
        assert!(async_transaction.is_err());
    }
}
