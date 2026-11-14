import { describe, expect, it } from 'vitest';
import type { CandidateContextElement } from './candidate-contexts';
import { CONTEXT_PADDING_PX } from './candidate-context-outline';
import { renderElementsToSvg } from './svg-render';
import {
  CONTEXT_INK,
  contextPlate,
  svgCandidateContexts,
  withContextReach,
} from './svg-render-contexts';
import type { Element, Tab } from './index';

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

const context = (id: string, notes: string[], suggested = false): CandidateContextElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label: `Billing & <co>`,
  esContext: { notes, ...(suggested ? { suggestion: { reason: 'r' } } : {}) },
});

const tab = (elements: Element[], o: Partial<Tab> = {}): Tab => ({
  id: 't',
  name: 'T',
  kind: 'event-storming',
  elements,
  ...o,
});

describe('svgCandidateContexts (docs/specs/021-event-storming/candidate-contexts.md "Where it lives")', () => {
  it('draws a kept context dashed in the canvas ink, and its name escaped in the middle', () => {
    const els = [note('a', 0), note('b', 300), context('c', ['a', 'b'])];
    const out = svgCandidateContexts(els, els, 'light', '#ffffff');
    expect(out.lines).toContain('data-candidate-context="c"');
    expect(out.lines).toContain(`stroke="${CONTEXT_INK.light.line}"`);
    expect(out.lines).toContain('stroke-dasharray');
    expect(out.names).toContain('Billing &amp; &lt;co&gt;');
    expect(out.names).toContain('fill="#ffffff" fill-opacity="0.85"');
    // The notes span 0..500 by 0..200: the name stands on their middle.
    expect(out.names).toContain('x="250" y="100" text-anchor="middle"');
    expect(out.bounds!.x).toBeLessThan(-CONTEXT_PADDING_PX);
  });

  it('inks a dark canvas in the dark pair', () => {
    const els = [note('a', 0), context('c', ['a'])];
    expect(svgCandidateContexts(els, els, 'dark', '#0f172a').lines).toContain(
      `stroke="${CONTEXT_INK.dark.line}"`,
    );
  });

  it('draws no suggested context and none whose notes are hidden', () => {
    const els = [note('a', 0), context('s', ['a'], true), context('h', ['a'])];
    const all = svgCandidateContexts(els, els, 'light', '#fff').lines;
    expect(all).not.toContain('data-candidate-context="s"');
    expect(all).toContain('data-candidate-context="h"');
    expect(svgCandidateContexts(els, [], 'light', '#fff')).toEqual({
      lines: '',
      names: '',
      bounds: null,
    });
  });
});

describe('contextPlate and withContextReach', () => {
  it('boxes a placed name round its centre', () => {
    expect(contextPlate({ x: 100, y: 50, fontPx: 15, width: 52, height: 22 })).toEqual({
      x: 74,
      y: 39,
      width: 52,
      height: 22,
    });
  });

  it('grows a content box to take in the reach, and keeps it with none', () => {
    const b = { x: 0, y: 0, w: 100, h: 100 };
    expect(withContextReach(b, null)).toBe(b);
    expect(withContextReach(b, { x: -10, y: -20, width: 50, height: 50 })).toEqual({
      x: -10,
      y: -20,
      w: 110,
      h: 120,
    });
  });
});

describe('renderElementsToSvg with candidate contexts', () => {
  it('draws the line beneath the notes, the name over them, and frames it in the image', () => {
    const svg = renderElementsToSvg(tab([note('a', 0, { label: 'Alpha' }), context('c', ['a'])]), {
      padding: 0,
    });
    const note0 = svg.search(/alpha/i);
    expect(svg.indexOf('data-candidate-context="c"')).toBeLessThan(note0);
    expect(svg.indexOf('data-candidate-context-name="c"')).toBeGreaterThan(note0);
    const viewBox = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+)/)!;
    expect(Number(viewBox[1])).toBeLessThan(-CONTEXT_PADDING_PX);
  });

  it('never draws the context as a shape of its own', () => {
    const svg = renderElementsToSvg(tab([note('a', 0), context('c', ['a'], true)]));
    expect(svg).not.toContain('Billing');
  });
});
