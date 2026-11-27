import { describe, expect, it } from 'vitest';
import { KeptPart, WorkbookObject } from './workbook-parts';

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet": objects over a sheet and the content a file
// carried that LiveDoc does not model, each read whole or not at all.
const range = { r1: 'rowa', c1: 'cola', r2: 'rowb', c2: 'colb' };

describe('WorkbookObject.read', () => {
  const chart = {
    id: 'o1',
    sheetId: 'sheet01',
    kind: 'chart',
    anchor: { at: 'cell', r: 'rowa', c: 'cola', dx: 4, dy: 2, w: 480, h: 300 },
    model: { type: 'pie' },
  };

  it('reads an object over a cell, on a sheet of its own, or not drawn at all', () => {
    expect(WorkbookObject.read(chart)).toEqual(chart);
    expect(WorkbookObject.read({ ...chart, anchor: { at: 'sheet' } })).toMatchObject({
      anchor: { at: 'sheet' },
    });
    expect(
      WorkbookObject.read({ ...chart, kind: 'filter-view', anchor: { at: 'none' } }),
    ).not.toBeNull();
  });

  it.each([
    ['a kind no area has', { ...chart, kind: 'gadget' }],
    [
      'an anchor off the grid',
      { ...chart, anchor: { at: 'cell', r: 'rowa', c: 'cola', dx: -1, dy: 0, w: 1, h: 1 } },
    ],
    ['a model that is not an object', { ...chart, model: [1] }],
    ['a model past the row it is stored in', { ...chart, model: { big: 'x'.repeat(1024 * 1024) } }],
  ])('refuses %s', (_, raw) => {
    expect(WorkbookObject.read(raw)).toBeNull();
  });
});

describe('KeptPart', () => {
  const macro = {
    id: 'k1',
    format: 'xlsx',
    part: 'xl/vbaProject.bin',
    anchor: { at: 'workbook' },
    xml: '<x/>',
  };

  it('reads a fragment kept for the workbook, a sheet, a cell or a range', () => {
    expect(KeptPart.read(macro)).toEqual(macro);
    for (const anchor of [
      { at: 'sheet', sheetId: 'sheet01' },
      { at: 'cell', sheetId: 'sheet01', r: 'rowa', c: 'cola' },
      { at: 'range', sheetId: 'sheet01', range },
    ])
      expect(KeptPart.read({ ...macro, anchor })).toMatchObject({ anchor });
  });

  it.each([
    ['a format that is not a workbook format', { ...macro, format: 'docx' }],
    ['an empty part path', { ...macro, part: '' }],
    ['an anchor on no sheet', { ...macro, anchor: { at: 'cell', r: 'rowa', c: 'cola' } }],
  ])('refuses %s', (_, raw) => {
    expect(KeptPart.read(raw)).toBeNull();
  });

  // standard-mapping.md "Unknown content": written back to the format it came from, never the other (C1).
  it('writes back only what its own format family carried', () => {
    const ods = { ...macro, id: 'k2', format: 'ods' as const, part: 'content.xml' };
    const kept = [KeptPart.read(macro)!, KeptPart.read(ods)!];
    expect(KeptPart.forFormat(kept, 'xlsx').map((k) => k.id)).toEqual(['k1']);
    expect(KeptPart.forFormat(kept, 'fods').map((k) => k.id)).toEqual(['k2']);
  });
});
