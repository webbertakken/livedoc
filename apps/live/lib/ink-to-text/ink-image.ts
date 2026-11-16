// The picture of the ink the reader is shown (docs/specs/023-draw-mode/ink-to-text.md "Reading"): dark strokes on
// white, round-capped, as a PNG data URL. A one-point stroke is a dot, drawn as a line to itself.
import type { InkPicture } from './ink-to-text';

const INK = '#111827';
const PAPER = '#ffffff';

export function inkImage(
  picture: InkPicture,
  makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): string | null {
  const canvas = makeCanvas();
  canvas.width = picture.width;
  canvas.height = picture.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, picture.width, picture.height);
  ctx.strokeStyle = INK;
  ctx.lineWidth = picture.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of picture.lines) {
    const [start, ...rest] = line;
    if (!start) continue;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (const p of rest.length > 0 ? rest : [start]) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}
