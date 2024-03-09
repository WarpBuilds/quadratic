import { beforeEach, describe, expect, it } from 'vitest';
import { CELL_HEIGHT, CELL_WIDTH } from '../../../constants/gridConstants';
import { HeadingResizing, SheetOffsets } from './SheetOffsets';

describe('gridOffsets', () => {
  let gridOffsets: SheetOffsets;

  beforeEach(() => {
    gridOffsets = new SheetOffsets();
  });

  const load = (columns: number[][], rows: number[][]) => {
    gridOffsets.load(JSON.stringify({ columns, rows }));
  };

  it('populates rows and columns', () => {
    load(
      [[3, 10]],
      [
        [4, 5],
        [5, 6],
      ]
    );
    const { rows, columns } = gridOffsets.debugRowsColumns();
    expect(columns.length).toBe(1);
    expect(rows.length).toBe(2);
  });

  it('gets column default width', () => {
    load([], []);
    expect(gridOffsets.getColumnWidth(0)).toBe(CELL_WIDTH);
  });

  it('gets column width', () => {
    load([[3, 10]], []);
    expect(gridOffsets.getColumnWidth(3)).toBe(10);
  });

  it('gets column width w/headingResize', () => {
    load([[3, 10]], []);
    gridOffsets.headingResizing = { column: 3, width: 15 } as any as HeadingResizing;
    expect(gridOffsets.getColumnWidth(3)).toBe(15);
  });

  it('gets row default height', () => {
    load([], []);
    expect(gridOffsets.getRowHeight(0)).toBe(CELL_HEIGHT);
  });

  it('gets row height', () => {
    load([], [[3, 10]]);
    expect(gridOffsets.getRowHeight(3)).toBe(10);
  });

  it('gets row height w/headingResize', () => {
    load([], [[3, 10]]);
    gridOffsets.headingResizing = { row: 3, height: 15 } as any as HeadingResizing;
    expect(gridOffsets.getRowHeight(3)).toBe(15);
  });

  it('gets column position using cache', () => {
    // double calls to check cache values
    expect(gridOffsets.getColumnPlacement(0).x).toBe(0);
    expect(gridOffsets.getColumnPlacement(0).x).toBe(0);

    expect(gridOffsets.getColumnPlacement(1).x).toBe(CELL_WIDTH);
    expect(gridOffsets.getColumnPlacement(1).x).toBe(CELL_WIDTH);

    expect(gridOffsets.getColumnPlacement(1000).x).toBe(CELL_WIDTH * 1000);
    expect(gridOffsets.getColumnPlacement(1000).x).toBe(CELL_WIDTH * 1000);

    expect(gridOffsets.getColumnPlacement(1000001).x).toBe(CELL_WIDTH * 1000001);
    expect(gridOffsets.getColumnPlacement(1000001).x).toBe(CELL_WIDTH * 1000001);

    expect(gridOffsets.getColumnPlacement(-1).x).toBe(-CELL_WIDTH);
    expect(gridOffsets.getColumnPlacement(-1).x).toBe(-CELL_WIDTH);

    expect(gridOffsets.getColumnPlacement(-1000).x).toBe(-CELL_WIDTH * 1000);
    expect(gridOffsets.getColumnPlacement(-1000).x).toBe(-CELL_WIDTH * 1000);

    expect(gridOffsets.getColumnPlacement(-1000001).x).toBe(-CELL_WIDTH * 1000001);
    expect(gridOffsets.getColumnPlacement(-1000001).x).toBe(-CELL_WIDTH * 1000001);
  });

  it('gets column position using cache w/resizing', () => {
    gridOffsets.headingResizing = { column: 0, width: 15 } as any as HeadingResizing;

    // double calls to check cache values
    expect(gridOffsets.getColumnPlacement(0).x).toBe(0);
    expect(gridOffsets.getColumnPlacement(0).x).toBe(0);

    expect(gridOffsets.getColumnPlacement(1).x).toBe(15);
    expect(gridOffsets.getColumnPlacement(1).x).toBe(15);

    expect(gridOffsets.getColumnPlacement(1000).x).toBe(15 + CELL_WIDTH * 999);
    expect(gridOffsets.getColumnPlacement(1000).x).toBe(15 + CELL_WIDTH * 999);

    expect(gridOffsets.getColumnPlacement(1000001).x).toBe(15 + CELL_WIDTH * 1000000);
    expect(gridOffsets.getColumnPlacement(1000001).x).toBe(15 + CELL_WIDTH * 1000000);
  });

  it('gets the start and end of a range of columns (positive to positive)', () => {
    load(
      [
        [1, 5],
        [2, 6],
        [3, 7],
      ],
      []
    );
    // 0            1   2 + 3 + 4
    // CELL_WIDTH + 5 + 6 + 7 + CELL_WIDTH
    const result1 = gridOffsets.getColumnsStartEnd(0, 5);
    expect(result1.xStart).toBe(0);
    expect(result1.xEnd).toBe(CELL_WIDTH + 5 + 6 + 7 + CELL_WIDTH - 1);

    // test using cache
    const result2 = gridOffsets.getColumnsStartEnd(0, 5);
    expect(result2.xStart).toBe(0);
    expect(result2.xEnd).toBe(CELL_WIDTH + 5 + 6 + 7 + CELL_WIDTH - 1);
  });

  it('gets the start and end of a range of columns (negative to 0)', () => {
    load(
      [
        [-1, 5],
        [-2, 6],
        [-3, 7],
      ],
      []
    );
    const { xStart, xEnd } = gridOffsets.getColumnsStartEnd(-5, 5);
    expect(xStart).toBe(-(5 + 6 + 7 + CELL_WIDTH * 2));
    expect(xEnd).toBe(-1);
  });

  it('gets the start and end of a range of columns (negative to negative)', () => {
    load(
      [
        [-1, 5],
        [-2, 6],
        [-3, 7],
      ],
      []
    );
    const { xStart, xEnd } = gridOffsets.getColumnsStartEnd(-5, 3);
    expect(xStart).toBe(-(CELL_WIDTH * 2 + 5 + 6 + 7));
    expect(xEnd).toBe(-5 - 6 - 1);
  });

  it('gets the start and end of a range of columns (negative) to < 0', () => {
    load(
      [
        [-1, 5],
        [-2, 6],
        [-3, 7],
      ],
      []
    );
    const { xStart, xEnd } = gridOffsets.getColumnsStartEnd(-5, 4);
    expect(xStart).toBe(-(CELL_WIDTH + CELL_WIDTH + 7 + 6 + 5));
    expect(xEnd).toBe(-5 - 1);
  });

  it('gets the start and end of a range of columns (negative) to > 0', () => {
    load(
      [
        [-1, 5],
        [-2, 6],
        [-3, 7],
        [0, 4],
      ],
      []
    );
    const { xStart, xEnd } = gridOffsets.getColumnsStartEnd(-5, 7);
    expect(xStart).toBe(-(CELL_WIDTH + CELL_WIDTH + 7 + 6 + 5));
    expect(xEnd).toBe(4 + CELL_WIDTH - 1);
  });

  it('gets row position using cache', () => {
    // double calls to check cache values
    expect(gridOffsets.getRowPlacement(0).y).toBe(0);
    expect(gridOffsets.getRowPlacement(0).y).toBe(0);

    expect(gridOffsets.getRowPlacement(1).y).toBe(CELL_HEIGHT);
    expect(gridOffsets.getRowPlacement(1).y).toBe(CELL_HEIGHT);

    expect(gridOffsets.getRowPlacement(1000).y).toBe(CELL_HEIGHT * 1000);
    expect(gridOffsets.getRowPlacement(1000).y).toBe(CELL_HEIGHT * 1000);

    expect(gridOffsets.getRowPlacement(1000001).y).toBe(CELL_HEIGHT * 1000001);
    expect(gridOffsets.getRowPlacement(1000001).y).toBe(CELL_HEIGHT * 1000001);
  });

  it('gets the start and end of a range of columns (rows to negative)', () => {
    load(
      [],
      [
        [-1, 5],
        [-2, 6],
        [-3, 7],
      ]
    );
    const { yStart, yEnd } = gridOffsets.getRowsStartEnd(-5, 3);
    expect(yStart).toBe(-(CELL_HEIGHT * 2 + 5 + 6 + 7));
    expect(yEnd).toBe(-5 - 6 - 1);
  });

  it('gets the start and end of a range of row (positive)', () => {
    load(
      [],
      [
        [1, 5],
        [2, 6],
        [3, 7],
      ]
    );
    const { yStart, yEnd } = gridOffsets.getRowsStartEnd(0, 5);
    expect(yStart).toBe(0);
    expect(yEnd).toBe(CELL_HEIGHT + 5 + 6 + 7 + CELL_HEIGHT - 1);
  });

  it('gets the start and end of a range of rows (negative) to 0', () => {
    load(
      [],
      [
        [-1, 5],
        [-2, 6],
        [-3, 7],
      ]
    );
    const { yStart, yEnd } = gridOffsets.getRowsStartEnd(-5, 5);
    expect(yStart).toBe(-(CELL_HEIGHT + 5 + 6 + 7 + CELL_HEIGHT));
    expect(yEnd).toBe(-1);
  });

  it('gets the start and end of a range of rows (negative) to < 0', () => {
    load(
      [],
      [
        [-1, 5],
        [-2, 6],
        [-3, 7],
      ]
    );
    const { yStart, yEnd } = gridOffsets.getRowsStartEnd(-5, 4);
    expect(yStart).toBe(-(CELL_HEIGHT + CELL_HEIGHT + 7 + 6 + 5));
    expect(yEnd).toBe(-5 - 1);
  });

  it('gets the start and end of a range of rows (negative) to > 0', () => {
    load(
      [],
      [
        [-1, 5],
        [-2, 6],
        [-3, 7],
        [0, 4],
      ]
    );
    const { yStart, yEnd } = gridOffsets.getRowsStartEnd(-5, 7);
    expect(yStart).toBe(-(CELL_HEIGHT + CELL_HEIGHT + 7 + 6 + 5));
    expect(yEnd).toBe(4 + CELL_HEIGHT - 1);
  });

  it('getScreenRectangle the bounds for the rectangle (0 to positive)', () => {
    const rectangle = gridOffsets.getScreenRectangle(0, 0, 9, 10);
    expect(rectangle.left).toBe(0);
    expect(rectangle.top).toBe(0);
    expect(rectangle.right).toBe(9 * CELL_WIDTH - 1);
    expect(rectangle.bottom).toBe(10 * CELL_HEIGHT - 1);
  });

  it('getScreenRectangle the bounds for the rectangle (positive to positive)', () => {
    const rectangle = gridOffsets.getScreenRectangle(1, 2, 9, 10);
    expect(rectangle.left).toBe(CELL_WIDTH);
    expect(rectangle.top).toBe(2 * CELL_HEIGHT);
    expect(rectangle.right).toBe(9 * CELL_WIDTH + CELL_WIDTH - 1);
    expect(rectangle.bottom).toBe(11 * CELL_HEIGHT + CELL_HEIGHT - 1);
  });

  it('getScreenRectangle the bounds for the rectangle (negative to negative)', () => {
    const rectangle = gridOffsets.getScreenRectangle(-9, -10, 5, 6);
    expect(rectangle.left).toBe(-9 * CELL_WIDTH);
    expect(rectangle.top).toBe(-10 * CELL_HEIGHT);
    expect(rectangle.right).toBe(-4 * CELL_WIDTH - 1);
    expect(rectangle.bottom).toBe(-4 * CELL_HEIGHT - 1);
  });

  it('ensure that getScreenRectangle and getColumnIndex return the same value (negative)', () => {
    const rectangle = gridOffsets.getScreenRectangle(-9, -10, 5, 6);
    expect(gridOffsets.getColumnIndex(rectangle.left).index).toBe(-9);
    expect(gridOffsets.getRowIndex(rectangle.top).index).toBe(-10);
    expect(gridOffsets.getColumnIndex(rectangle.right).index).toBe(-9 + 5 - 1);
    expect(gridOffsets.getRowIndex(rectangle.bottom).index).toBe(-10 + 6 - 1);

    // check the cache
    expect(gridOffsets.getColumnIndex(rectangle.left).index).toBe(-9);
    expect(gridOffsets.getRowIndex(rectangle.top).index).toBe(-10);
    expect(gridOffsets.getColumnIndex(rectangle.right).index).toBe(-9 + 5 - 1);
    expect(gridOffsets.getRowIndex(rectangle.bottom).index).toBe(-10 + 6 - 1);
  });

  it('ensure that getScreenRectangle and getColumnIndex return the same value (positive)', () => {
    const rectangle = gridOffsets.getScreenRectangle(20, 0, 100, 200);
    expect(rectangle.width).toBe(CELL_WIDTH * 100 - 1);
    expect(rectangle.height).toBe(CELL_HEIGHT * 200 - 1);
    expect(gridOffsets.getColumnIndex(rectangle.left).index).toBe(20);
    expect(gridOffsets.getRowIndex(rectangle.top).index).toBe(0);

    // check the cache
    expect(gridOffsets.getColumnIndex(rectangle.left).index).toBe(20);
    expect(gridOffsets.getRowIndex(rectangle.top).index).toBe(0);
  });

  it('gets columnIndex for large index', () => {
    expect(gridOffsets.getColumnIndex(1000000).index).toBe(1000000 / CELL_WIDTH);
    expect(gridOffsets.getColumnIndex(1000000).position).toBe(1000000);
    expect(gridOffsets.getColumnIndex(1000005).index).toBe(1000000 / CELL_WIDTH);
    expect(gridOffsets.getColumnIndex(1000005).position).toBe(1000000);
  });
});
