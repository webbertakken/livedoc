// docs/specs/009-elements/pie-chart.md "Smooth Line" (D284): a curve through a line's points that keeps within each
// pair of neighbours' values.
import { describe, expect, it } from 'vitest';
import { lineMarks } from './chart-marks';
import { smoothPath } from './chart-smooth';
import type { ShapeElement } from './index';
import { createShape } from './shape-factory';
import { svgLineChart } from './svg-render-charts';
import { elementValidationIssue } from './validate';

// The curve's points along each cubic, sampled.
function sample(path: string): { x: number; y: number }[] {
  const nums = path.replace(/[MC]/g, ' ').trim().split(/\s+/).map(Number);
  const out: { x: number; y: number }[] = [];
  let [x0, y0] = [nums[0]!, nums[1]!];
  for (let i = 2; i + 5 < nums.length + 0; i += 6) {
    const [x1, y1, x2, y2, x3, y3] = nums.slice(i, i + 6) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let t = 0; t <= 1; t += 0.05) {
      const u = 1 - t;
      out.push({
        x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      });
    }
    [x0, y0] = [x3, y3];
  }
  return out;
}

describe('smoothPath', () => {
  it('draws two points as a straight stretch, and one as nothing', () => {
    expect(
      smoothPath([
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ]),
    ).toBe('M 0 10 L 10 0');
    expect(smoothPath([{ x: 0, y: 10 }])).toBe('');
  });

  it('passes through every point, a cubic between each pair', () => {
    const pts = [
      { x: 0, y: 50 },
      { x: 10, y: 20 },
      { x: 20, y: 30 },
      { x: 30, y: 0 },
    ];
    const path = smoothPath(pts);
    expect(path.startsWith('M 0 50 C')).toBe(true);
    expect(path.match(/C/g)).toHaveLength(3);
    for (const p of pts.slice(1)) expect(path).toContain(` ${p.x} ${p.y}`);
  });

  it('never rises past a pair of neighbours’ values, a flat stretch staying flat', () => {
    const pts = [
      { x: 0, y: 100 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 90 },
      { x: 40, y: 100 },
      { x: 50, y: 100 },
    ];
    const curve = sample(smoothPath(pts));
    for (const c of curve) {
      const k = Math.min(pts.length - 2, Math.floor(c.x / 10 + 1e-9));
      const [a, b] = [pts[k]!.y, pts[k + 1]!.y];
      expect(c.y).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-6);
      expect(c.y).toBeLessThanOrEqual(Math.max(a, b) + 1e-6);
    }
  });

  it('tames a steep step so its curve stays monotone', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0.1 },
      { x: 2, y: 100 },
      { x: 3, y: 100.1 },
    ];
    const ys = sample(smoothPath(pts)).map((c) => c.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThanOrEqual(ys[i - 1]! - 1e-6);
  });

  it('reads points sharing an x as flat between them', () => {
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 0, y: 5 },
        { x: 10, y: 10 },
      ]),
    ).toContain('C');
  });
});

describe('lineMarks smooth', () => {
  const AREA = { x: 0, y: 0, w: 300, h: 200 };
  const CATS = ['a', 'b', 'c', 'd', 'e'];
  const SERIES = [{ name: 'S', values: [1, 3, 2, null, 4] }];
  it('curves a line chart’s stretches, a gap still breaking them', () => {
    const m = lineMarks(AREA, CATS, SERIES, 'line', 0, 0, false, null, true);
    expect(m.lines[0]!.match(/M/g)).toHaveLength(1);
    expect(m.lines[0]!).toContain(' C ');
    const straight = lineMarks(AREA, CATS, SERIES, 'line', 0, 0, false, null, false);
    expect(m.points).toEqual(straight.points);
    expect(straight.lines[0]!).not.toContain('C');
  });
  it('leaves an area chart straight', () => {
    const area = lineMarks(AREA, CATS, SERIES, 'area', 0, 0, false, null, true);
    expect(area).toEqual(lineMarks(AREA, CATS, SERIES, 'area', 0, 0, false, null, false));
  });
});

describe('a smooth line chart in SVG', () => {
  it('draws its lines as curves, and is a valid element field', () => {
    const el = {
      ...createShape('line-chart', 0, 0),
      width: 300,
      height: 200,
      chartSmooth: true,
    } as ShapeElement;
    expect(svgLineChart(el, '#000')).toMatch(/<path d="M [^"]* C /);
    expect(svgLineChart({ ...el, chartSmooth: false }, '#000')).not.toMatch(/<path d="M [^"]* C /);
    expect(elementValidationIssue(el)).toBeNull();
    expect(elementValidationIssue({ ...el, chartSmooth: 'yes' })).not.toBeNull();
    expect(elementValidationIssue({ ...el, chartStack: 'none' })).not.toBeNull();
  });
});
