// docs/specs/021-event-storming/board-structure.md "Pivotal events": the tape in an exported image.
import { describe, expect, it } from 'vitest';
import { DARK_CANVAS_BACKGROUND_COLOR, DEFAULT_BACKGROUND_COLOR } from './canvas-colors';
import { contrastRatio, hexToRgb, rgbToHex } from './colour-math';
import { ES_LANE_PITCH } from './event-storming-lanes';
import { PIVOTAL_TAPE_PX } from './event-storming-structure';
import { renderElementsToSvg } from './svg-render';
import { CONTEXT_INK } from './svg-render-contexts';
import { PIVOTAL_TAPE_OPACITY, svgPivotalTapes } from './svg-render-structure';
import type { Element, Tab } from './index';

const event = (id: string, x: number, extra: Record<string, unknown> = {}): Element => ({
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

const tab = (elements: Element[]): Tab => ({
  id: 't',
  name: 'T',
  kind: 'event-storming',
  elements,
});

describe('svgPivotalTapes', () => {
  it('draws a band through each pivotal event shown, in the canvas ink, and says how far it reaches', () => {
    const els = [event('a', 0, { esPivotal: true }), event('b<', 400, { esPivotal: true })];
    const out = svgPivotalTapes(els, els, 'light');
    expect(out.tapes).toContain(
      `<rect data-pivotal-tape="a" x="${100 - PIVOTAL_TAPE_PX / 2}" y="${-ES_LANE_PITCH / 2}" ` +
        `width="${PIVOTAL_TAPE_PX}" height="${200 + ES_LANE_PITCH}" rx="${PIVOTAL_TAPE_PX / 2}" ` +
        `fill="${CONTEXT_INK.light.line}" fill-opacity="${PIVOTAL_TAPE_OPACITY}"/>`,
    );
    expect(out.tapes).toContain('data-pivotal-tape="b&lt;"');
    expect(out.bounds).toEqual({
      x: 100 - PIVOTAL_TAPE_PX / 2,
      y: -ES_LANE_PITCH / 2,
      width: 400 + PIVOTAL_TAPE_PX,
      height: 200 + ES_LANE_PITCH,
    });
  });

  it('inks a dark canvas in the dark line', () => {
    const els = [event('a', 0, { esPivotal: true })];
    expect(svgPivotalTapes(els, els, 'dark').tapes).toContain(`fill="${CONTEXT_INK.dark.line}"`);
  });

  it('draws nothing for a board without a pivotal event, or with its event hidden', () => {
    const els = [event('a', 0, { esPivotal: true }), event('b', 400)];
    expect(svgPivotalTapes([event('b', 0)], [event('b', 0)], 'light')).toEqual({
      tapes: '',
      bounds: null,
    });
    expect(svgPivotalTapes(els, [els[1]!], 'light')).toEqual({ tapes: '', bounds: null });
  });
});

describe('the tape’s ink', () => {
  // WCAG 2.2 SC 1.4.11: a graphic that carries meaning stands 3:1 or more against what it is drawn on.
  it.each([
    ['light', DEFAULT_BACKGROUND_COLOR],
    ['dark', DARK_CANVAS_BACKGROUND_COLOR],
  ] as const)('stands 3:1 or more against the %s canvas at its opacity', (surface, paper) => {
    const ink = hexToRgb(CONTEXT_INK[surface].line)!;
    const under = hexToRgb(paper)!;
    const mix = (a: number, b: number) =>
      Math.round(a * PIVOTAL_TAPE_OPACITY + b * (1 - PIVOTAL_TAPE_OPACITY));
    const seen = rgbToHex({
      r: mix(ink.r, under.r),
      g: mix(ink.g, under.g),
      b: mix(ink.b, under.b),
    });
    expect(contrastRatio(seen, paper)).toBeGreaterThanOrEqual(3);
  });
});

describe('renderElementsToSvg with a pivotal event', () => {
  it('draws the tape beneath the notes and frames it in the image', () => {
    const svg = renderElementsToSvg(tab([event('a', 0, { label: 'Alpha', esPivotal: true })]), {
      padding: 0,
    });
    expect(svg.indexOf('data-pivotal-tape="a"')).toBeGreaterThan(-1);
    expect(svg.indexOf('data-pivotal-tape="a"')).toBeLessThan(svg.search(/alpha/i));
    const viewBox = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)/)!;
    expect(Number(viewBox[2])).toBe(-ES_LANE_PITCH / 2);
    expect(Number(viewBox[4])).toBe(200 + ES_LANE_PITCH);
  });

  it('draws no tape on a board without one', () => {
    expect(renderElementsToSvg(tab([event('a', 0)]))).not.toContain('data-pivotal-tape');
  });
});
