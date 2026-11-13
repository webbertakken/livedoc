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
  it('draws a kept context dashed in the canvas ink, its name escaped on a plate of paper', () => {
    const els = [note('a', 0), note('b', 300), context('c', ['a', 'b'])];
    const out = svgCandidateContexts(els, els, 'light', '#ffffff');
    expect(out.svg).toContain('data-candidate-context="c"');
    expect(out.svg).toContain(`stroke="${CONTEXT_INK.light.line}"`);
    expect(out.svg).toContain('stroke-dasharray');
    expect(out.svg).toContain('Billing &amp; &lt;co&gt;');
    expect(out.svg).toContain('fill="#ffffff"');
    expect(out.bounds!.x).toBeLessThan(-CONTEXT_PADDING_PX);
  });

  it('inks a dark canvas in the dark pair', () => {
    const els = [note('a', 0), context('c', ['a'])];
    expect(svgCandidateContexts(els, els, 'dark', '#0f172a').svg).toContain(
      `stroke="${CONTEXT_INK.dark.line}"`,
    );
  });

  it('draws no suggested context and none whose notes are hidden', () => {
    const els = [note('a', 0), context('s', ['a'], true), context('h', ['a'])];
    const all = svgCandidateContexts(els, els, 'light', '#fff').svg;
    expect(all).not.toContain('data-candidate-context="s"');
    expect(all).toContain('data-candidate-context="h"');
    const out = svgCandidateContexts(els, [], 'light', '#fff');
    expect(out).toEqual({ svg: '', bounds: null });
  });
});

describe('contextPlate and withContextReach', () => {
  it('centres the plate on the label point, padded', () => {
    expect(contextPlate({ x: 100, y: 50 }, 40)).toEqual({ x: 94, y: 40, width: 52, height: 20 });
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
  it('draws the outline beneath the notes and frames it in the image', () => {
    const svg = renderElementsToSvg(tab([note('a', 0, { label: 'Alpha' }), context('c', ['a'])]), {
      padding: 0,
    });
    expect(svg.indexOf('data-candidate-context')).toBeGreaterThan(0);
    expect(svg.indexOf('data-candidate-context')).toBeLessThan(svg.search(/alpha/i));
    const viewBox = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+)/)!;
    expect(Number(viewBox[1])).toBeLessThan(-CONTEXT_PADDING_PX);
  });

  it('never draws the context as a shape of its own', () => {
    const svg = renderElementsToSvg(tab([note('a', 0), context('c', ['a'], true)]));
    expect(svg).not.toContain('Billing');
  });
});
