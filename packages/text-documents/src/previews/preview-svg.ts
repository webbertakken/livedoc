// A page of a page preview drawn as SVG (docs/specs/034-text-documents/agents-and-sync.md "Page previews", "What is
// drawn"): the sheet in its page colour, each placed block's lines in Inter, tables with their grid, inline pictures
// as grey boxes with their alt text, and "Approximate preview" in the bottom margin. Pure.
import { escapeXmlAttribute, escapeXmlText } from '@livedoc/office-packages';
import type { PageFrame } from '../pagination/pagination';
import type { DrawnLine, DrawnMarker, PreviewBlock } from './preview-blocks';
import type { Placed } from './preview-lines';

/** What every preview says of itself. */
export const APPROXIMATE_LABEL = 'Approximate preview';
const LABEL_SIZE_PX = 9;
const LABEL_COLOUR = '#6b7280';
const GRID_COLOUR = '#9ca3af';
const BOX_FILL = '#e5e7eb';
const BOX_TEXT_PX = 10;
const TEXT_COLOUR = '#000000';
// A line this far past a cell's foot still shows: measured heights round.
const CLIP_SLACK_PX = 0.5;

/** A block's lines `fromLine` to `toLine` on a page: its top (where its line 0 would stand) and its left. */
export type PlacedBlock = {
  readonly block: PreviewBlock;
  readonly fromLine: number;
  readonly toLine: number;
  readonly top: number;
  readonly left: number;
};

const n = (value: number) => Math.round(value * 100) / 100;

function textPiece(piece: Extract<Placed, { kind: 'text' }>, x: number, baseline: number): string {
  const { look } = piece;
  const colour = escapeXmlAttribute(look.color ?? TEXT_COLOUR);
  // Drawn in Inter, fitted to the width its own face takes, so the words stand where they were broken.
  const fitted =
    look.face && piece.width > 0
      ? ` textLength="${n(piece.width)}" lengthAdjust="spacingAndGlyphs"`
      : '';
  const text = `<text x="${n(x)}" y="${n(baseline)}" font-family="Inter" font-size="${n(look.size)}"${
    look.bold ? ' font-weight="700"' : ''
  }${look.italic ? ' font-style="italic"' : ''} fill="${colour}"${fitted} xml:space="preserve">${escapeXmlText(piece.text)}</text>`;
  const rule = (y: number) =>
    `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + piece.width)}" y2="${n(y)}" stroke="${colour}" stroke-width="${n(
      Math.max(1, look.size / 14),
    )}"/>`;
  return (
    text +
    (look.underline ? rule(baseline + look.size * 0.12) : '') +
    (look.strike ? rule(baseline - look.size * 0.3) : '')
  );
}

function boxPiece(piece: Extract<Placed, { kind: 'box' }>, x: number, bottom: number): string {
  const top = bottom - piece.height;
  const alt =
    piece.alt !== '' && piece.height >= BOX_TEXT_PX * 2
      ? `<text x="${n(x + piece.width / 2)}" y="${n(top + piece.height / 2 + BOX_TEXT_PX / 3)}" font-family="Inter" font-size="${BOX_TEXT_PX}" fill="${LABEL_COLOUR}" text-anchor="middle">${escapeXmlText(piece.alt)}</text>`
      : '';
  return `<rect x="${n(x)}" y="${n(top)}" width="${n(piece.width)}" height="${n(piece.height)}" fill="${BOX_FILL}" stroke="${GRID_COLOUR}"/>${alt}`;
}

function lineSvg(line: DrawnLine, left: number, top: number): string {
  return line.pieces
    .map((piece) =>
      piece.kind === 'text'
        ? textPiece(piece, left + line.x + piece.x, top + line.baseline)
        : boxPiece(piece, left + line.x + piece.x, top + line.top + line.height),
    )
    .join('');
}

function markerSvg(drawn: DrawnMarker, left: number, line: DrawnLine, top: number): string {
  const x = left + drawn.x;
  const baseline = top + line.baseline;
  if (drawn.marker.kind === 'check') {
    const side = drawn.look.size * 0.7;
    return `<rect x="${n(x)}" y="${n(baseline - side)}" width="${n(side)}" height="${n(side)}" fill="none" stroke="${TEXT_COLOUR}"/>${
      drawn.marker.checked
        ? `<path d="M${n(x + side * 0.2)} ${n(baseline - side * 0.5)}l${n(side * 0.25)} ${n(side * 0.3)}l${n(side * 0.4)} ${n(-side * 0.6)}" fill="none" stroke="${TEXT_COLOUR}"/>`
        : ''
    }`;
  }
  return textPiece(
    { kind: 'text', text: drawn.marker.text, look: drawn.look, x: 0, width: 0 },
    x,
    baseline,
  );
}

function blockSvg({ block, fromLine, toLine, top, left }: PlacedBlock): string {
  const { drawn } = block;
  if (drawn.kind === 'paragraph') {
    const lines = drawn.lines.slice(fromLine, toLine);
    const first = drawn.lines[0];
    const marker =
      drawn.marker && fromLine === 0 && first ? markerSvg(drawn.marker, left, first, top) : '';
    return marker + lines.map((line) => lineSvg(line, left, top)).join('');
  }
  if (drawn.kind === 'table') {
    const rows = drawn.rows;
    return rows
      .slice(fromLine, toLine)
      .map((row, r) => {
        const at = fromLine + r;
        return row.cells
          .map((cell) => {
            const height = rows
              .slice(at, at + cell.rows)
              .reduce((sum, each) => sum + each.height, 0);
            const x = left + drawn.x + cell.x;
            const y = top + row.top;
            return `<rect x="${n(x)}" y="${n(y)}" width="${n(cell.width)}" height="${n(height)}" fill="${
              cell.background ? escapeXmlAttribute(cell.background) : 'none'
            }" stroke="${GRID_COLOUR}"/>${cell.lines
              // An exact row clips what does not fit, as the editor does.
              .filter((line) => line.top + line.height <= height + CLIP_SLACK_PX)
              .map((line) => lineSvg(line, x, y))
              .join('')}`;
          })
          .join('');
      })
      .join('');
  }
  return '';
}

/** A page as SVG, `frame` sized, its placed blocks drawn. */
export function pageSvg(
  frame: PageFrame,
  placed: readonly PlacedBlock[],
  pageColor?: string,
): string {
  const label = `<text x="${n(frame.width - frame.left)}" y="${n(frame.height - Math.min(frame.bottom, 48) / 2)}" font-family="Inter" font-size="${LABEL_SIZE_PX}" fill="${LABEL_COLOUR}" text-anchor="end">${APPROXIMATE_LABEL}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(frame.width)}" height="${n(frame.height)}" viewBox="0 0 ${n(
    frame.width,
  )} ${n(frame.height)}"><rect width="100%" height="100%" fill="${escapeXmlAttribute(pageColor ?? '#ffffff')}"/>${placed
    .map(blockSvg)
    .join('')}${label}</svg>`;
}
