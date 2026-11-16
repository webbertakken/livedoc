import { describe, expect, it, vi } from 'vitest';
import { inkImage } from './ink-image';

// docs/specs/023-draw-mode/ink-to-text.md "Reading": dark strokes on white, as a PNG.
function fakeCanvas(withContext = true) {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    fillRect: vi.fn(() => calls.push('fill')),
    beginPath: vi.fn(() => calls.push('begin')),
    moveTo: vi.fn(() => calls.push('move')),
    lineTo: vi.fn(() => calls.push('line')),
    stroke: vi.fn(() => calls.push('stroke')),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => (withContext ? ctx : null),
    toDataURL: (type: string) => `data:${type};base64,AAAA`,
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx, calls };
}

const picture = {
  width: 200,
  height: 80,
  margin: 16,
  lineWidth: 3,
  lines: [
    [
      { x: 16, y: 16 },
      { x: 40, y: 50 },
    ],
    [{ x: 60, y: 20 }],
    [],
  ],
};

describe('inkImage', () => {
  it('paints white, then each stroke dark, and hands back a PNG', () => {
    const { canvas, ctx, calls } = fakeCanvas();
    expect(inkImage(picture, () => canvas)).toBe('data:image/png;base64,AAAA');
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(80);
    expect(calls).toEqual([
      'fill',
      'begin',
      'move',
      'line',
      'stroke',
      'begin',
      'move',
      'line',
      'stroke',
    ]);
    expect(ctx.strokeStyle).toBe('#111827');
    expect(ctx.lineWidth).toBe(3);
  });

  it('draws on a new page canvas by default', () => {
    const { canvas } = fakeCanvas();
    vi.stubGlobal('document', { createElement: () => canvas });
    try {
      expect(inkImage(picture)).toBe('data:image/png;base64,AAAA');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('is null where the browser gives no 2D context', () => {
    const { canvas } = fakeCanvas(false);
    expect(inkImage(picture, () => canvas)).toBeNull();
  });
});
