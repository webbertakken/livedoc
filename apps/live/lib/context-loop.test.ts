import { describe, expect, it } from 'vitest';
import type { Element } from '@livedoc/document';
import { loopPath, notesInLoop } from './context-loop';

// docs/specs/021-event-storming/candidate-contexts.md "Making one by hand".

const note = (id: string, x: number, extra: Record<string, unknown> = {}): Element => ({
  id,
  type: 'sticky',
  x,
  y: 0,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
  ...extra,
});
const loop = [
  { x: -10, y: -10 },
  { x: 520, y: -10 },
  { x: 520, y: 210 },
  { x: -10, y: 210 },
];

describe('notesInLoop', () => {
  it('takes the workshop notes whose centre lies inside, on visible layers', () => {
    const els = [
      note('a', 0),
      note('b', 300),
      note('half', 450),
      note('far', 900),
      note('plain', 100, { esKind: undefined }),
      note('hidden', 50),
    ];
    expect(notesInLoop(els, loop, new Set(['hidden']))).toEqual(['a', 'b']);
  });

  it('takes nothing from a loop too short to enclose anything', () => {
    expect(notesInLoop([note('a', 0)], loop.slice(0, 2), new Set())).toEqual([]);
  });
});

describe('loopPath', () => {
  it('draws the loop closed, and nothing for no points', () => {
    expect(loopPath(loop.slice(0, 2))).toBe('M-10 -10L520 -10Z');
    expect(loopPath([])).toBe('');
  });
});
