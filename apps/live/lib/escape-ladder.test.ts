import { describe, expect, it } from 'vitest';
import type { CanvasTool } from '@/components/palette/palette.types';
import {
  ESCAPE_LADDER,
  escapeLayer,
  restingTool,
  toolInHand,
  type EscapeLayer,
  type EscapeState,
} from './escape-ladder';

// docs/specs/004-interface-design/escape.md "The ladder": one press backs out of the innermost layer present.
describe('escapeLayer', () => {
  const table: [string, EscapeState, EscapeLayer | null][] = [
    ['nothing transient', {}, null],
    ['a field alone', { field: true }, 'field'],
    [
      'a field over everything else',
      { field: true, gesture: true, surface: true, tool: true },
      'field',
    ],
    ['a gesture over a surface', { gesture: true, surface: true, selection: true }, 'gesture'],
    ['a surface over a highlight', { surface: true, highlight: true }, 'surface'],
    ['a highlight over a tool', { highlight: true, tool: true, selection: true }, 'highlight'],
    ['a tool over the selection', { tool: true, selection: true, zen: true }, 'tool'],
    ['the selection over zen', { selection: true, zen: true }, 'selection'],
    ['zen alone', { zen: true }, 'zen'],
    ['layers that are explicitly absent', { field: false, highlight: false, zen: true }, 'zen'],
  ];

  it.each(table)('backs out of %s', (_name, state, expected) => {
    expect(escapeLayer(state)).toBe(expected);
  });

  it('orders the layers innermost first', () => {
    expect(ESCAPE_LADDER).toEqual([
      'field',
      'gesture',
      'surface',
      'highlight',
      'tool',
      'selection',
      'zen',
    ]);
  });
});

// docs/specs/004-interface-design/escape.md: "The resting tool is Select on a computer and Hand on a touch screen".
describe('restingTool', () => {
  it('rests on Select on a computer', () => {
    expect(restingTool(false)).toBe('select');
  });

  it('rests on Hand on a touch screen', () => {
    expect(restingTool(true)).toBe('pan');
  });
});

describe('toolInHand', () => {
  const held: CanvasTool[] = [
    'eraser',
    'format',
    'laser',
    'spotlight',
    'slide-deck',
    'isometric',
    'avatar',
  ];

  it.each(held)('holds %s on a computer and on a touch screen', (tool) => {
    expect(toolInHand(tool, false)).toBe(true);
    expect(toolInHand(tool, true)).toBe(true);
  });

  it('holds Hand on a computer, where it is not the resting tool', () => {
    expect(toolInHand('pan', false)).toBe(true);
  });

  it('holds nothing in the resting tool', () => {
    expect(toolInHand('select', false)).toBe(false);
    expect(toolInHand('pan', true)).toBe(false);
  });

  it('holds nothing in Select on a touch screen, which Escape has nothing to put down from', () => {
    expect(toolInHand('select', true)).toBe(false);
  });
});
