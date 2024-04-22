import { quadraticCore } from '@/app/web-workers/quadraticCore/quadraticCore';
import { sheets } from '../../grid/controller/Sheets';

export function selectAllCells() {
  const sheet = sheets.sheet;
  const bounds = sheet.getBounds(true);

  if (bounds) {
    sheet.cursor.changePosition({
      multiCursor: {
        originPosition: { x: bounds.left, y: bounds.top },
        terminalPosition: { x: bounds.right, y: bounds.bottom },
      },
      cursorPosition: { x: bounds.left, y: bounds.top },
    });
  } else {
    sheet.cursor.changePosition({
      multiCursor: undefined,
      cursorPosition: { x: 0, y: 0 },
    });
  }
}

export async function selectColumns(start: number, end: number) {
  const sheet = sheets.sheet;
  const bounds = await quadraticCore.getColumnsBounds(sheet.id, start, end, true);
  if (bounds) {
    sheet.cursor.changePosition({
      cursorPosition: { x: start, y: bounds.min },
      multiCursor: {
        originPosition: { x: start, y: bounds.min },
        terminalPosition: { x: end, y: bounds.max },
      },
    });
  } else {
    sheet.cursor.changePosition({
      cursorPosition: { x: start, y: 0 },
      multiCursor: undefined,
    });
  }
}

export async function selectRows(start: number, end: number): Promise<void> {
  const sheet = sheets.sheet;
  const bounds = await quadraticCore.getRowsBounds(sheet.id, start, end, true);
  if (bounds) {
    sheet.cursor.changePosition({
      cursorPosition: { x: bounds.min, y: start },
      multiCursor: {
        originPosition: { x: bounds.min, y: start },
        terminalPosition: { x: bounds.max, y: end },
      },
    });
  } else {
    sheet.cursor.changePosition({
      cursorPosition: { x: 0, y: start },
      multiCursor: undefined,
    });
  }
}
