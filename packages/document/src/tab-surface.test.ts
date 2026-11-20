// docs/specs/006-document/kinds-outside-the-canvas.md "The surface": which surface a tab has, if any.
import { describe, expect, it } from 'vitest';
import { hasCanvasTab, surfaceOf, TAB_SURFACES } from './tab-surface';

describe('surfaceOf', () => {
  it('names a text document tab’s surface, in any document', () => {
    expect(surfaceOf({ kind: 'text-document' }, false)).toBe('text-document');
    expect(surfaceOf({ kind: 'text-document' }, true)).toBe('text-document');
  });

  it('names a spreadsheet’s sheet tab’s surface', () => {
    expect(surfaceOf({ kind: 'sheet' }, true)).toBe('spreadsheet');
  });

  it('leaves a Plan Sheet, a sheet tab without a workbook, on the canvas', () => {
    expect(surfaceOf({ kind: 'sheet' }, false)).toBeNull();
  });

  it.each(['diagram', 'event-storming', 'board', 'dashboard', 'form', undefined])(
    'leaves a %s tab on the canvas',
    (kind) => {
      expect(surfaceOf({ kind }, false)).toBeNull();
    },
  );

  it('reads no tab as the canvas', () => {
    expect(surfaceOf(undefined, false)).toBeNull();
  });

  it('names every surface it can answer', () => {
    expect(TAB_SURFACES).toEqual(['text-document', 'spreadsheet']);
  });
});

describe('hasCanvasTab', () => {
  it('is false for a document whose tabs all have a surface', () => {
    expect(hasCanvasTab([{ kind: 'text-document' }], false)).toBe(false);
    expect(hasCanvasTab([{ kind: 'sheet' }, { kind: 'sheet' }], true)).toBe(false);
  });

  it('is true when any tab is a canvas', () => {
    expect(hasCanvasTab([{ kind: 'text-document' }, { kind: 'diagram' }], false)).toBe(true);
    expect(hasCanvasTab([{}], false)).toBe(true);
  });

  it('is false for no tabs', () => {
    expect(hasCanvasTab([], false)).toBe(false);
  });
});
