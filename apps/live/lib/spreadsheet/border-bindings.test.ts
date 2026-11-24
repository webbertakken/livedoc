import { describe, expect, it, vi } from 'vitest';
import { BORDER_LINE_START, borderBindings, gridBorders, strokeOf } from './border-bindings';

// docs/specs/029-sheets/formatting.md "Borders" (D209); keyboard-shortcuts.md "Format cells".
describe('strokeOf', () => {
  it('draws each line in the colour chosen, a double at three pixels', () => {
    expect(strokeOf({ colour: '#ff0000', line: 'thin' })).toEqual({
      w: 1,
      s: 'solid',
      c: '#ff0000',
    });
    expect(strokeOf({ colour: '#000000', line: 'medium' })).toEqual({
      w: 2,
      s: 'solid',
      c: '#000000',
    });
    expect(strokeOf({ colour: '#000000', line: 'thick' })).toEqual({
      w: 3,
      s: 'solid',
      c: '#000000',
    });
    expect(strokeOf({ colour: '#000000', line: 'dashed' })).toEqual({
      w: 1,
      s: 'dashed',
      c: '#000000',
    });
    expect(strokeOf({ colour: '#000000', line: 'dotted' })).toEqual({
      w: 1,
      s: 'dotted',
      c: '#000000',
    });
    expect(strokeOf({ colour: '#000000', line: 'double' })).toEqual({
      w: 3,
      s: 'double',
      c: '#000000',
    });
    expect(BORDER_LINE_START).toEqual({ colour: '#000000', line: 'thin' });
  });
});

describe('gridBorders', () => {
  it('applies a placement in the line chosen and keeps a new colour or line', () => {
    const draw = vi.fn();
    const choose = vi.fn();
    const borders = gridBorders({ colour: '#ff0000', line: 'dashed' }, draw, choose);
    expect([borders.colour, borders.line]).toEqual(['#ff0000', 'dashed']);
    borders.apply('horizontal');
    expect(draw).toHaveBeenCalledWith('horizontal', { w: 1, s: 'dashed', c: '#ff0000' });
    borders.setColour('#00ff00');
    borders.setLine('double');
    expect(choose.mock.calls).toEqual([
      [{ colour: '#00ff00', line: 'dashed' }],
      [{ colour: '#ff0000', line: 'double' }],
    ]);
  });
});

describe('borderBindings', () => {
  it('binds the six border shortcuts to their placements, in the line chosen', () => {
    const draw = vi.fn<(mode: string, border: unknown) => void>();
    const b = borderBindings(BORDER_LINE_START, draw);
    for (const id of [
      'apply-top-border',
      'apply-right-border',
      'apply-bottom-border',
      'apply-left-border',
      'remove-borders',
      'apply-outer-border',
    ])
      b[id]!.run();
    expect(draw.mock.calls.map(([mode]) => mode)).toEqual([
      'top',
      'right',
      'bottom',
      'left',
      'none',
      'outer',
    ]);
    expect(draw.mock.calls[0]![1]).toEqual({ w: 1, s: 'solid', c: '#000000' });
  });
});
