// Lines as a file holds them, made into a layout (standard-mapping.md "Rows and columns in the file", D124, D168).
import { describe, expect, it } from 'vitest';
import { fileLinesOf, layoutFromLines, lineAtPx, type FileAxisLines } from './file-lines';

const layout = { rows: ['ra01', 'rb01', 'rc01', 'rd01'], cols: ['ca01', 'cb01'] };
const axis = (over: Partial<FileAxisLines>): FileAxisLines => ({
  lines: new Map(),
  collapsed: [],
  ...over,
});

describe('layoutFromLines', () => {
  it('makes nothing of nothing', () => {
    expect(layoutFromLines(undefined, layout, 10)).toEqual({ layout: {}, cut: false });
  });

  it('keeps sizes whole and within the Resize dialog’s, a line at the sheet’s own taking it', () => {
    const read = layoutFromLines(
      {
        r: axis({
          size: 30,
          lines: new Map([
            [0, { size: 5 }],
            [1, { size: 30.2 }],
            [2, { size: 9000 }],
            [9, { size: 50 }],
          ]),
        }),
        c: axis({ size: 120, lines: new Map([[1, { size: 64 }]]) }),
      },
      layout,
      10,
    );
    expect(read.layout).toEqual({
      rowHeight: 30,
      rowSize: { ra01: 18, rc01: 2000 },
      colSize: { cb01: 64 },
    });
  });

  it('cuts sized lines past the most a sheet holds, rows first', () => {
    const read = layoutFromLines(
      {
        r: axis({ lines: new Map([[0, { size: 40 }]]) }),
        c: axis({ lines: new Map([[0, { size: 40 }]]) }),
      },
      layout,
      1,
    );
    expect(read).toEqual({ layout: { rowSize: { ra01: 40 } }, cut: true });
  });

  it('hides a collapsed group’s lines by the group alone, and keeps depths at most 7 (D168)', () => {
    const read = layoutFromLines(
      {
        r: axis({
          lines: new Map([
            [0, { hidden: true }],
            [1, { hidden: true, depth: 9 }],
            [2, { depth: 7 }],
          ]),
          collapsed: [{ at: 1, depth: 1 }],
          after: true,
        }),
        c: axis({ after: true }),
      },
      layout,
      10,
    );
    expect(read.layout).toEqual({
      hiddenRows: ['ra01'],
      rowDepth: { rb01: 7, rc01: 7 },
      rowCollapsed: [{ at: 'rb01', depth: 1 }],
      controlsAfter: { r: true },
    });
  });
});

describe('lineAtPx', () => {
  it('finds the line a position falls on, past hidden ones, the last line holding what lies beyond', () => {
    const axis = {
      lines: new Map([
        [0, { size: 50 }],
        [1, { hidden: true as const }],
      ]),
      collapsed: [],
      size: 20,
    };
    expect(lineAtPx(axis, 0, 100, 5)).toEqual({ at: 0, offset: 0 });
    expect(lineAtPx(axis, 55, 100, 5)).toEqual({ at: 2, offset: 5 });
    expect(lineAtPx(axis, 75, 100, 5)).toEqual({ at: 3, offset: 5 });
    expect(lineAtPx(axis, 500, 100, 5)).toEqual({ at: 4, offset: 410 });
    expect(lineAtPx(undefined, -3, 100, 2)).toEqual({ at: 0, offset: 0 });
  });
});

describe('fileLinesOf', () => {
  it('leaves out a collapse naming a line no longer there', () => {
    const lines = fileLinesOf({
      ...layout,
      rowDepth: { ra01: 1 },
      rowCollapsed: [{ at: 'gone0001', depth: 1 }],
    });
    expect(lines.r.collapsed).toEqual([]);
    expect(lines.r.lines).toEqual(new Map([[0, { depth: 1 }]]));
  });
});
