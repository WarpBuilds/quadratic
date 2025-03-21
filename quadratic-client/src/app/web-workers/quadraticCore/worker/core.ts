/**
 * Interface between the core webworker and quadratic-core (Rust)
 *
 * This is a singleton where one instance exists for the web worker and can be
 * directly accessed by its siblings.
 */

import { bigIntReplacer } from '@/app/bigint';
import { debugWebWorkers } from '@/app/debugFlags';
import type {
  BorderSelection,
  BorderStyle,
  CellAlign,
  CellFormatSummary,
  CellVerticalAlign,
  CellWrap,
  CodeCellLanguage,
  DataTableSort,
  Direction,
  Format,
  JsCellValue,
  JsClipboard,
  JsCodeCell,
  JsCodeResult,
  JsCoordinate,
  JsDataTableColumnHeader,
  JsRenderCell,
  JsSelectionContext,
  JsSummarizeSelectionResult,
  JsTablesContext,
  MinMax,
  Pos,
  Rect,
  SearchOptions,
  SheetPos,
  Validation,
} from '@/app/quadratic-core-types';
import initCore, { GridController } from '@/app/quadratic-core/quadratic_core';
import type {
  MultiplayerCoreReceiveTransaction,
  MultiplayerCoreReceiveTransactions,
} from '@/app/web-workers/multiplayerWebWorker/multiplayerCoreMessages';
import type {
  ClientCoreAddDataTable,
  ClientCoreFindNextColumnForRect,
  ClientCoreFindNextRowForRect,
  ClientCoreGetCsvPreview,
  ClientCoreImportFile,
  ClientCoreLoad,
  ClientCoreMoveCells,
  ClientCoreMoveCodeCellHorizontally,
  ClientCoreMoveCodeCellVertically,
  ClientCoreSummarizeSelection,
} from '@/app/web-workers/quadraticCore/coreClientMessages';
import { coreClient } from '@/app/web-workers/quadraticCore/worker/coreClient';
import { coreRender } from '@/app/web-workers/quadraticCore/worker/coreRender';
import { offline } from '@/app/web-workers/quadraticCore/worker/offline';
import {
  numbersToRectStringified,
  pointsToRect,
  posToPos,
  posToRect,
  toSheetPos,
} from '@/app/web-workers/quadraticCore/worker/rustConversions';
import * as Sentry from '@sentry/react';
import { Buffer } from 'buffer';
import { Rectangle } from 'pixi.js';

class Core {
  gridController?: GridController;

  private async loadGridFile(file: string, addToken: boolean): Promise<Uint8Array> {
    let requestInit = {};

    if (addToken) {
      const jwt = await coreClient.getJwt();
      requestInit = { headers: { Authorization: `Bearer ${jwt}` } };
    }

    const res = await fetch(file, requestInit);
    return new Uint8Array(await res.arrayBuffer());
  }

  // Creates a Grid from a file. Initializes bother coreClient and coreRender w/metadata.
  async loadFile(
    message: ClientCoreLoad,
    renderPort: MessagePort,
    addToken: boolean
  ): Promise<{ version: string } | { error: string }> {
    coreRender.init(renderPort);
    const results = await Promise.all([this.loadGridFile(message.url, addToken), initCore()]);
    try {
      this.gridController = GridController.newFromFile(results[0], message.sequenceNumber, true);
    } catch (e) {
      console.error('Error loading grid file:', e);
      Sentry.captureException(e);
      return { error: 'Unable to load file' };
    }
    if (debugWebWorkers) console.log('[core] GridController loaded');
    return { version: this.gridController.getVersion() };
  }

  getSheetName(sheetId: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined in Core.getSheetName');
      resolve(this.gridController.getSheetName(sheetId));
    });
  }

  getSheetOrder(sheetId: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined in Core.getSheetOrder');
      resolve(this.gridController.getSheetOrder(sheetId));
    });
  }

  getSheetColor(sheetId: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined in Core.getSheetColor');
      resolve(this.gridController.getSheetColor(sheetId));
    });
  }

  // Gets the bounds of a sheet.
  getGridBounds(data: {
    sheetId: string;
    ignoreFormatting: boolean;
  }): Promise<{ x: number; y: number; width: number; height: number } | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined in Core.getGridBounds');
      const bounds = this.gridController.getGridBounds(data.sheetId, data.ignoreFormatting);
      if (bounds.type === 'empty') {
        resolve(undefined);
      } else {
        resolve({
          x: bounds.min.x,
          y: bounds.min.y,
          width: bounds.max.x - bounds.min.x,
          height: bounds.max.y - bounds.min.y,
        });
      }
    });
  }

  // Gets RenderCell[] for a region of a Sheet.
  getRenderCells(data: {
    sheetId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<JsRenderCell[]> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined in Core.getRenderCells');
      const renderCells: JsRenderCell[] = this.gridController.getRenderCells(
        data.sheetId,
        numbersToRectStringified(data.x, data.y, data.width, data.height)
      );
      resolve(renderCells);
    });
  }

  // Gets the SheetIds for the Grid.
  getSheetIds(): Promise<string[]> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined in Core.getSheetIds');
      const sheetIds: string[] = this.gridController.getSheetIds();
      resolve(sheetIds);
    });
  }

  getCodeCell(sheetId: string, x: number, y: number): Promise<JsCodeCell | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined in Core.getCodeCell');
      resolve(this.gridController.getCodeCell(sheetId, posToPos(x, y)));
    });
  }

  cellHasContent(sheetId: string, x: number, y: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined in Core.cellHasContent');
      resolve(this.gridController.hasRenderCells(sheetId, posToRect(x, y)));
    });
  }

  getEditCell(sheetId: string, x: number, y: number): Promise<string> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined in Core.getEditCell');
      resolve(this.gridController.getEditCell(sheetId, posToPos(x, y)));
    });
  }

  setCellValue(sheetId: string, x: number, y: number, value: string, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setCellValue(sheetId, x, y, value, cursor);
      resolve(undefined);
    });
  }

  setCellValues(sheetId: string, x: number, y: number, values: string[][], cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setCellValues(sheetId, x, y, values, cursor);
      resolve(undefined);
    });
  }

  getCellFormatSummary(sheetId: string, x: number, y: number): Promise<CellFormatSummary> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      resolve(this.gridController.getCellFormatSummary(sheetId, posToPos(x, y)));
    });
  }

  getFormatCell(sheetId: string, x: number, y: number): Promise<Format | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const format = this.gridController.getFormatCell(sheetId, x, y);
      resolve(format);
    });
  }

  receiveSequenceNum(sequenceNum: number) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.receiveSequenceNum(sequenceNum);
      resolve(undefined);
    });
  }

  receiveTransaction(message: MultiplayerCoreReceiveTransaction) {
    return new Promise(async (resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const data = message.transaction;

      if (typeof data.operations === 'string') {
        data.operations = Buffer.from(data.operations, 'base64');
      }

      this.gridController.multiplayerTransaction(data.id, data.sequence_num, new Uint8Array(data.operations));
      offline.markTransactionSent(data.id);
      if (await offline.unsentTransactionsCount()) {
        coreClient.sendMultiplayerState('syncing');
      } else {
        coreClient.sendMultiplayerState('connected');
      }
      resolve(undefined);
    });
  }

  receiveTransactions(receive_transactions: MultiplayerCoreReceiveTransactions) {
    return new Promise(async (resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');

      const formattedTransactions = receive_transactions.transactions.map((transaction) => ({
        id: transaction.id,
        file_id: transaction.file_id,
        sequence_num: transaction.sequence_num,
        operations:
          typeof transaction.operations === 'string'
            ? Array.from(Buffer.from(transaction.operations, 'base64'))
            : Array.from(transaction.operations),
      }));
      receive_transactions.transactions = [];

      this.gridController.receiveMultiplayerTransactions(formattedTransactions);

      // sends multiplayer synced to the client, to proceed from file loading screen
      coreClient.sendMultiplayerSynced();

      if (await offline.unsentTransactionsCount()) {
        coreClient.sendMultiplayerState('syncing');
      } else {
        coreClient.sendMultiplayerState('connected');
      }
      resolve(undefined);
    });
  }

  summarizeSelection(message: ClientCoreSummarizeSelection): Promise<JsSummarizeSelectionResult | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const summary = this.gridController.summarizeSelection(message.selection, BigInt(message.decimalPlaces));
      resolve(summary);
    });
  }

  setBold(selection: string, bold?: boolean, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setBold(selection, bold, cursor);
      resolve(undefined);
    });
  }

  setItalic(selection: string, italic?: boolean, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setItalic(selection, italic, cursor);
      resolve(undefined);
    });
  }

  setTextColor(selection: string, color?: string, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setTextColor(selection, color, cursor);
      resolve(undefined);
    });
  }

  setUnderline(selection: string, underline?: boolean, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setUnderline(selection, underline, cursor);
      resolve(undefined);
    });
  }

  setStrikeThrough(selection: string, strikeThrough?: boolean, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setStrikeThrough(selection, strikeThrough, cursor);
      resolve(undefined);
    });
  }

  setFillColor(selection: string, fillColor?: string, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setFillColor(selection, fillColor, cursor);
      resolve(undefined);
    });
  }

  setCommas(selection: string, commas?: boolean, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setCommas(selection, commas, cursor);
      resolve(undefined);
    });
  }

  getRenderCell(sheetId: string, x: number, y: number): Promise<JsRenderCell | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const renderCells: JsRenderCell[] | undefined = this.gridController.getRenderCells(sheetId, posToRect(x, y));
      resolve(renderCells?.[0]);
    });
  }

  setCurrency(selection: string, symbol: string, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setCurrency(selection, symbol, cursor);
      resolve(undefined);
    });
  }

  async upgradeGridFile(
    file: ArrayBuffer,
    sequenceNum: number
  ): Promise<{ contents?: ArrayBuffer; version?: string; error?: string }> {
    try {
      await initCore();
      const gc = GridController.newFromFile(new Uint8Array(file), sequenceNum, false);
      const version = gc.getVersion();
      const contents = gc.exportGridToFile();
      return { contents, version };
    } catch (error: unknown) {
      console.error(error);
      reportError(error);
      Sentry.captureException(error);
      return { error: error as string };
    }
  }

  async importFile({
    file,
    fileName,
    fileType,
    sheetId,
    location,
    cursor,
    csvDelimiter,
    hasHeading,
  }: ClientCoreImportFile): Promise<{ contents?: ArrayBuffer; version?: string; error?: string }> {
    if (cursor === undefined) {
      try {
        await initCore();
        let gc: GridController;
        switch (fileType) {
          case 'excel':
            gc = GridController.importExcel(new Uint8Array(file), fileName);
            break;
          case 'csv':
            gc = GridController.importCsv(new Uint8Array(file), fileName, csvDelimiter, hasHeading);
            break;
          case 'parquet':
            gc = GridController.importParquet(new Uint8Array(file), fileName);
            break;
          default:
            throw new Error('Unsupported file type');
        }
        const version = gc.getVersion();
        const contents = gc.exportGridToFile();
        return { contents, version };
      } catch (error: unknown) {
        console.error(error);
        reportError(error);
        Sentry.captureException(error);
        return { error: error as string };
      }
    } else {
      return new Promise((resolve) => {
        if (!this.gridController) throw new Error('Expected gridController to be defined');
        try {
          switch (fileType) {
            case 'excel':
              this.gridController.importExcelIntoExistingFile(new Uint8Array(file), fileName, cursor);
              break;
            case 'csv':
              if (sheetId === undefined || location === undefined) {
                throw new Error('Expected sheetId and location to be defined');
              }
              this.gridController.importCsvIntoExistingFile(
                new Uint8Array(file),
                fileName,
                sheetId,
                posToPos(location.x, location.y),
                cursor,
                csvDelimiter,
                hasHeading
              );
              break;
            case 'parquet':
              if (sheetId === undefined || location === undefined) {
                throw new Error('Expected sheetId and location to be defined');
              }
              this.gridController.importParquetIntoExistingFile(
                new Uint8Array(file),
                fileName,
                sheetId,
                posToPos(location.x, location.y),
                cursor
              );
              break;
            default:
              throw new Error('Unsupported file type');
          }
          resolve({});
        } catch (error: unknown) {
          // TODO(ddimaria): standardize on how WASM formats errors for a consistent error
          // type in the UI.
          console.error(error);
          reportError(error);
          Sentry.captureException(error);
          resolve({ error: error as string });
        }
      });
    }
  }

  async getCsvPreview({ file, maxRows, delimiter }: ClientCoreGetCsvPreview): Promise<string[][] | undefined> {
    try {
      await initCore();
      return GridController.getCsvPreview(new Uint8Array(file), maxRows, delimiter);
    } catch (error: unknown) {
      console.error(error);
      reportError(error);
      Sentry.captureException(error);
      return undefined;
    }
  }

  deleteCellValues(selection: string, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.deleteCellValues(selection, cursor);
      resolve(undefined);
    });
  }

  setCodeCellValue(
    sheetId: string,
    x: number,
    y: number,
    language: CodeCellLanguage,
    codeString: string,
    cursor?: string
  ): Promise<string | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      resolve(this.gridController.setCellCode(sheetId, posToPos(x, y), language, codeString, cursor));
    });
  }

  addSheet(cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.addSheet(cursor);
      resolve(undefined);
    });
  }

  deleteSheet(sheetId: string, cursor: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.deleteSheet(sheetId, cursor);
      resolve(undefined);
    });
  }

  moveSheet(sheetId: string, previous: string | undefined, cursor: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.moveSheet(sheetId, previous, cursor);
      resolve(undefined);
    });
  }

  setSheetName(sheetId: string, name: string, cursor: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setSheetName(sheetId, name, cursor);
      resolve(undefined);
    });
  }

  setSheetColor(sheetId: string, color: string | undefined, cursor: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setSheetColor(sheetId, color, cursor);
      resolve(undefined);
    });
  }

  duplicateSheet(sheetId: string, cursor: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.duplicateSheet(sheetId, cursor);
      resolve(undefined);
    });
  }

  undo(cursor: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.undo(cursor);
      resolve(undefined);
    });
  }

  redo(cursor: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.redo(cursor);
      resolve(undefined);
    });
  }

  export(): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      resolve(this.gridController.exportOpenGridToFile());
    });
  }

  search(search: string, searchOptions: SearchOptions): Promise<SheetPos[]> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      resolve(this.gridController.search(search, searchOptions));
    });
  }

  hasRenderCells(sheetId: string, x: number, y: number, width: number, height: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      resolve(this.gridController.hasRenderCells(sheetId, numbersToRectStringified(x, y, width, height)));
    });
  }

  setAlign(selection: string, align: CellAlign, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setAlign(selection, align, cursor);
      resolve(undefined);
    });
  }

  setVerticalAlign(selection: string, verticalAlign: CellVerticalAlign, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setVerticalAlign(selection, verticalAlign, cursor);
      resolve(undefined);
    });
  }

  setWrap(selection: string, wrap: CellWrap, cursor?: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setWrap(selection, wrap, cursor);
      resolve(undefined);
    });
  }

  //#region Clipboard
  copyToClipboard(selection: string): Promise<JsClipboard> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const jsClipboard = this.gridController.copyToClipboard(selection);
      resolve(jsClipboard);
    });
  }

  cutToClipboard(selection: string, cursor: string): Promise<JsClipboard> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const jsClipboard = this.gridController.cutToClipboard(selection, cursor);
      resolve(jsClipboard);
    });
  }

  pasteFromClipboard({
    selection,
    plainText,
    html,
    special,
    cursor,
  }: {
    selection: string;
    plainText: string | undefined;
    html: string | undefined;
    special: string;
    cursor: string;
  }) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.pasteFromClipboard(selection, plainText, html, special, cursor);
      resolve(undefined);
    });
  }

  //#endregion

  setBorders(selection: string, borderSelection: BorderSelection, style: BorderStyle | undefined, cursor: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setBorders(selection, JSON.stringify(borderSelection), JSON.stringify(style), cursor);
      resolve(undefined);
    });
  }

  setChartSize(sheetId: string, x: number, y: number, width: number, height: number, cursor: string) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.setChartSize(toSheetPos(x, y, sheetId), width, height, cursor);
      resolve(undefined);
    });
  }

  autocomplete(
    sheetId: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    fullX1: number,
    fullY1: number,
    fullX2: number,
    fullY2: number,
    cursor: string
  ) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      this.gridController.autocomplete(
        sheetId,
        pointsToRect(x1, y1, x2, y2),
        pointsToRect(fullX1, fullY1, fullX2, fullY2),
        cursor
      );
      resolve(undefined);
    });
  }

  exportCsvSelection(selection: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      resolve(this.gridController.exportCsvSelection(selection));
    });
  }

  getColumnsBounds(
    sheetId: string,
    start: number,
    end: number,
    ignoreFormatting: boolean
  ): Promise<MinMax | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const result = this.gridController.getColumnsBounds(sheetId, start, end, ignoreFormatting);
      if (result) resolve(result);
      else resolve(undefined);
    });
  }

  getRowsBounds(sheetId: string, start: number, end: number, ignoreFormatting: boolean): Promise<MinMax | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const result = this.gridController.getRowsBounds(sheetId, start, end, ignoreFormatting);
      if (result) resolve(result);
      else resolve(undefined);
    });
  }

  jumpCursor(
    sheetId: string,
    current: JsCoordinate,
    jump: boolean,
    direction: Direction
  ): Promise<JsCoordinate | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const pos = this.gridController.jumpCursor(
        sheetId,
        posToPos(current.x, current.y),
        jump,
        JSON.stringify(direction)
      );
      resolve({ x: Number(pos.x), y: Number(pos.y) });
    });
  }

  findNextColumnForRect(data: ClientCoreFindNextColumnForRect): Promise<number> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      resolve(
        this.gridController.findNextColumnForRect(
          data.sheetId,
          data.columnStart,
          data.row,
          data.width,
          data.height,
          data.reverse
        )
      );
    });
  }

  findNextRowForRect(data: ClientCoreFindNextRowForRect): Promise<number> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      resolve(
        this.gridController.findNextRowForRect(
          data.sheetId,
          data.column,
          data.rowStart,
          data.width,
          data.height,
          data.reverse
        )
      );
    });
  }

  commitTransientResize(sheetId: string, transientResize: string, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.commitOffsetsResize(sheetId, transientResize, cursor);
  }

  commitSingleResize(
    sheetId: string,
    column: number | undefined,
    row: number | undefined,
    size: number,
    cursor: string
  ) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.commitSingleResize(sheetId, column, row, size, cursor);
  }

  calculationComplete(results: JsCodeResult) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.calculationComplete(JSON.stringify(results));
  }

  connectionComplete(transactionId: string, data: ArrayBuffer, std_out?: string, std_err?: string, extra?: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.connectionComplete(transactionId, new Uint8Array(data), std_out, std_err, extra);
  }

  // Returns true if the transaction was applied successfully.
  applyOfflineUnsavedTransaction(transactionId: string, transactions: string): boolean {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    try {
      this.gridController.applyOfflineUnsavedTransaction(transactionId, transactions);
      return true;
    } catch (error: any) {
      console.log(error);
      return false;
    }
  }

  clearFormatting(selection: string, cursor?: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.clearFormatting(selection, cursor);
  }

  rerunCodeCells(sheetId?: string, x?: number, y?: number, cursor?: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      if (sheetId !== undefined && x !== undefined && y !== undefined) {
        return resolve(this.gridController.rerunCodeCell(sheetId, posToPos(x, y), cursor));
      }
      if (sheetId !== undefined) {
        return resolve(this.gridController.rerunSheetCodeCells(sheetId, cursor));
      }
      return resolve(this.gridController.rerunAllCodeCells(cursor));
    });
  }

  cancelExecution(transactionId: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const codeResult: JsCodeResult = {
      transaction_id: transactionId,
      success: false,
      std_err: 'Execution cancelled by user',
      std_out: null,
      output_value: null,
      output_array: null,
      line_number: null,
      output_display_type: null,
      cancel_compute: true,
      chart_pixel_output: null,
      has_headers: false,
    };
    this.gridController.calculationComplete(JSON.stringify(codeResult));
  }

  changeDecimalPlaces(selection: string, decimals: number, cursor?: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.changeDecimalPlaces(selection, decimals, cursor);
  }

  setPercentage(selection: string, cursor?: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.setPercentage(selection, cursor);
  }

  setExponential(selection: string, cursor?: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.setExponential(selection, cursor);
  }

  removeNumericFormat(selection: string, cursor?: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.removeNumericFormat(selection, cursor);
  }

  moveCells(message: ClientCoreMoveCells) {
    return new Promise((resolve) => {
      if (!this.gridController) throw new Error('Expected gridController to be defined');
      const dest: SheetPos = {
        x: BigInt(message.targetX),
        y: BigInt(message.targetY),
        sheet_id: { id: message.targetSheetId },
      };
      this.gridController.moveCells(
        JSON.stringify(message.source, bigIntReplacer),
        JSON.stringify(dest, bigIntReplacer),
        message.columns,
        message.rows,
        message.cursor
      );
      resolve(undefined);
    });
  }

  moveCodeCellVertically(message: ClientCoreMoveCodeCellVertically): Pos {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    return this.gridController.moveCodeCellVertically(
      message.sheetId,
      BigInt(message.x),
      BigInt(message.y),
      message.sheetEnd,
      message.reverse,
      message.cursor
    );
  }

  moveCodeCellHorizontally(message: ClientCoreMoveCodeCellHorizontally): Pos {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    return this.gridController.moveCodeCellHorizontally(
      message.sheetId,
      BigInt(message.x),
      BigInt(message.y),
      message.sheetEnd,
      message.reverse,
      message.cursor
    );
  }

  getValidations(sheetId: string): Validation[] {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const validations: Validation[] = this.gridController.getValidations(sheetId);
    return validations;
  }

  updateValidation(validation: Validation, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.updateValidation(JSON.stringify(validation, bigIntReplacer), cursor);
  }

  removeValidation(sheetId: string, validationId: string, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.removeValidation(sheetId, validationId, cursor);
  }

  removeValidations(sheetId: string, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.removeValidations(sheetId, cursor);
  }

  getValidationFromPos(sheetId: string, x: number, y: number): Validation | undefined {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const validation: Validation | undefined = this.gridController.getValidationFromPos(sheetId, posToPos(x, y));
    return validation;
  }

  receiveRowHeights = (transactionId: string, sheetId: string, rowHeights: string) => {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.receiveRowHeights(transactionId, sheetId, rowHeights);
  };

  setDateTimeFormat(selection: string, format: string, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.setDateTimeFormat(selection, format, cursor);
  }

  getValidationList(sheetId: string, x: number, y: number): string[] {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const list: string[] = this.gridController.getValidationList(sheetId, BigInt(x), BigInt(y));
    return list;
  }

  getDisplayCell(sheetId: string, x: number, y: number) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    return this.gridController.getDisplayValue(sheetId, posToPos(x, y));
  }

  validateInput(sheetId: string, x: number, y: number, input: string): string | undefined {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const validationId = this.gridController.validateInput(sheetId, posToPos(x, y), input);
    return validationId;
  }

  getCellValue(sheetId: string, x: number, y: number): JsCellValue | undefined {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const cellValue: JsCellValue | undefined = this.gridController.getCellValue(sheetId, posToPos(x, y));
    return cellValue;
  }

  getAISelectionContexts(args: {
    selections: string[];
    maxRects?: number;
    includeErroredCodeCells: boolean;
    includeTablesSummary: boolean;
    includeChartsSummary: boolean;
  }): JsSelectionContext[] | undefined {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const aiSelectionContexts: JsSelectionContext[] | undefined = this.gridController.getAISelectionContexts(
      args.selections,
      args.maxRects,
      args.includeErroredCodeCells,
      args.includeTablesSummary,
      args.includeChartsSummary
    );
    return aiSelectionContexts;
  }

  getAITablesContext(): JsTablesContext[] | undefined {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const aiTablesContext: JsTablesContext[] | undefined = this.gridController.getAITablesContext();
    return aiTablesContext;
  }

  neighborText(sheetId: string, x: number, y: number): string[] {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const neighborText: string[] | undefined = this.gridController.neighborText(sheetId, BigInt(x), BigInt(y));
    return neighborText ?? [];
  }

  deleteColumns(sheetId: string, columns: number[], cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.deleteColumns(sheetId, JSON.stringify(columns), cursor);
  }

  insertColumn(sheetId: string, column: number, right: boolean, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.insertColumn(sheetId, BigInt(column), right, cursor);
  }

  deleteRows(sheetId: string, rows: number[], cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.deleteRows(sheetId, JSON.stringify(rows), cursor);
  }

  insertRow(sheetId: string, row: number, below: boolean, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.insertRow(sheetId, BigInt(row), below, cursor);
  }

  flattenDataTable(sheetId: string, x: number, y: number, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.flattenDataTable(sheetId, posToPos(x, y), cursor);
  }

  codeDataTableToDataTable(sheetId: string, x: number, y: number, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.codeDataTableToDataTable(sheetId, posToPos(x, y), cursor);
  }

  gridToDataTable(sheetRect: string, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.gridToDataTable(sheetRect, cursor);
  }

  dataTableMeta(
    sheetId: string,
    x: number,
    y: number,
    name?: string,
    alternatingColors?: boolean,
    columns?: JsDataTableColumnHeader[],
    showUI?: boolean,
    showName?: boolean,
    showColumns?: boolean,
    cursor?: string
  ) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.dataTableMeta(
      sheetId,
      posToPos(x, y),
      name,
      alternatingColors,
      JSON.stringify(columns),
      showUI,
      showName,
      showColumns,
      cursor
    );
  }

  dataTableMutations(args: {
    sheetId: string;
    x: number;
    y: number;
    select_table: boolean;
    columns_to_add?: number[];
    columns_to_remove?: number[];
    rows_to_add?: number[];
    rows_to_remove?: number[];
    flatten_on_delete?: boolean;
    swallow_on_insert?: boolean;
    cursor?: string;
  }) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.dataTableMutations(
      args.sheetId,
      posToPos(args.x, args.y),
      args.select_table,
      args.columns_to_add ? new Uint32Array(args.columns_to_add) : undefined,
      args.columns_to_remove ? new Uint32Array(args.columns_to_remove) : undefined,
      args.rows_to_add ? new Uint32Array(args.rows_to_add) : undefined,
      args.rows_to_remove ? new Uint32Array(args.rows_to_remove) : undefined,
      args.flatten_on_delete,
      args.swallow_on_insert,
      args.cursor
    );
  }

  sortDataTable(sheetId: string, x: number, y: number, sort: DataTableSort[] | undefined, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.sortDataTable(sheetId, posToPos(x, y), JSON.stringify(sort), cursor);
  }

  dataTableFirstRowAsHeader(sheetId: string, x: number, y: number, firstRowAsHeader: boolean, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.dataTableFirstRowAsHeader(sheetId, posToPos(x, y), firstRowAsHeader, cursor);
  }

  addDataTable(args: ClientCoreAddDataTable) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.addDataTable(
      args.sheetId,
      posToPos(args.x, args.y),
      args.name,
      args.values,
      args.firstRowIsHeader,
      args.cursor
    );
  }

  getCellsA1(transactionId: string, a1: string): string {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    return this.gridController.calculationGetCellsA1(transactionId, a1);
  }

  finiteRectFromSelection(selection: string): Rectangle | undefined {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    const rect: Rect | undefined = this.gridController.finiteRectFromSelection(selection);
    return rect
      ? new Rectangle(
          Number(rect.min.x),
          Number(rect.min.y),
          Number(rect.max.x - rect.min.x) + 1,
          Number(rect.max.y - rect.min.y) + 1
        )
      : undefined;
  }

  moveColumns(sheetId: string, colStart: number, colEnd: number, to: number, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.moveColumns(sheetId, colStart, colEnd, to, cursor);
  }

  moveRows(sheetId: string, rowStart: number, rowEnd: number, to: number, cursor: string) {
    if (!this.gridController) throw new Error('Expected gridController to be defined');
    this.gridController.moveRows(sheetId, rowStart, rowEnd, to, cursor);
  }
}

export const core = new Core();
