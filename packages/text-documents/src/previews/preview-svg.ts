// A page of a page preview drawn as SVG (docs/specs/034-text-documents/agents-and-sync.md "Page previews", "What is
// drawn"): the sheet in its page colour, each placed block's lines in Inter, paragraphs' shading and borders, tables
// with their grid, inline pictures as grey boxes with their alt text, and "Approximate preview" in the bottom margin.
// The template gallery draws the same page without the label, in the editor's faces, on light or dark paper
// (starting-and-finding.md "The template gallery's text documents"). Pure.
import { escapeXmlAttribute, escapeXmlText } from '@livedoc/office-packages';
import type { PageFrame } from '../pagination/pagination';
import { DARK_INK, DARK_PAPER, fillOnDarkPaper, inkOnDarkPaper, LIGHT_PAPER } from '../paper';
import type { DrawnBorder, DrawnLine, DrawnMarker, PreviewBlock } from './preview-blocks';
import type { Look, Placed } from './preview-lines';

/** What every preview says of itself. */
export const APPROXIMATE_LABEL = 'Approximate preview';
const LABEL_SIZE_PX = 9;
const LABEL_COLOUR = '#6b7280';
const GRID_COLOUR = '#9ca3af';
/** The grid on dark paper: Google's dark grey (default). */
const DARK_GRID_COLOUR = '#5f6368';
const BOX_FILL = '#e5e7eb';
const DARK_BOX_FILL = '#3c4043';
const TEXT_COLOUR = '#000000';
// A line this far past a cell's foot still shows: measured heights round.
const CLIP_SLACK_PX = 0.5;
// A highlight's box around a line's text, as shares of its size: from its ascent to its descent.
const HIGHLIGHT_ABOVE = 0.85;
const HIGHLIGHT_BELOW = 0.25;

/** The paper a preview is drawn on: white, or the editor's dark paper with its colours drawn as the editor draws them. */
export type PreviewPaper = 'light' | 'dark';

export type PreviewOptions = {
  /** Whether the page says "Approximate preview"; agents' previews do (default true). */
  readonly label?: boolean;
  readonly paper?: PreviewPaper;
  /** Draw each run in the editor's font stack rather than Inter alone (default false: render-png carries Inter). */
  readonly faces?: boolean;
};

/** A block's lines `fromLine` to `toLine` on a page: its top (where its line 0 would stand) and its left. */
export type PlacedBlock = {
  readonly block: PreviewBlock;
  readonly fromLine: number;
  readonly toLine: number;
  readonly top: number;
  readonly left: number;
};

// The colours a page is drawn in on its paper.
type Paint = {
  readonly sheet: (pageColor: string | undefined) => string;
  readonly ink: (color: string | undefined) => string;
  readonly fill: (color: string) => string;
  readonly grid: string;
  readonly box: string;
  readonly faces: boolean;
};

const LIGHT: Paint = {
  sheet: (pageColor) => pageColor ?? LIGHT_PAPER,
  ink: (color) => color ?? TEXT_COLOUR,
  fill: (color) => color,
  grid: GRID_COLOUR,
  box: BOX_FILL,
  faces: false,
};

const DARK: Paint = {
  sheet: (pageColor) => (pageColor ? fillOnDarkPaper(pageColor) : DARK_PAPER),
  ink: (color) => (color ? inkOnDarkPaper(color) : DARK_INK),
  fill: fillOnDarkPaper,
  grid: DARK_GRID_COLOUR,
  box: DARK_BOX_FILL,
  faces: false,
};

const n = (value: number) => Math.round(value * 100) / 100;

const familyOf = (look: Look, paint: Paint) =>
  escapeXmlAttribute(paint.faces && look.stack ? look.stack : 'Inter');

function textPiece(
  piece: Extract<Placed, { kind: 'text' }>,
  x: number,
  baseline: number,
  paint: Paint,
): string {
  const { look } = piece;
  const colour = escapeXmlAttribute(paint.ink(look.color));
  const highlight = look.highlight
    ? `<rect x="${n(x)}" y="${n(baseline - look.size * HIGHLIGHT_ABOVE)}" width="${n(piece.width)}" height="${n(
        look.size * (HIGHLIGHT_ABOVE + HIGHLIGHT_BELOW),
      )}" fill="${escapeXmlAttribute(paint.fill(look.highlight))}"/>`
    : '';
  // Fitted to the width its own face takes, so the words stand where they were broken.
  const fitted =
    look.face && piece.width > 0
      ? ` textLength="${n(piece.width)}" lengthAdjust="spacingAndGlyphs"`
      : '';
  const text = `<text x="${n(x)}" y="${n(baseline)}" font-family="${familyOf(look, paint)}" font-size="${n(look.size)}"${
    look.bold ? ' font-weight="700"' : ''
  }${look.italic ? ' font-style="italic"' : ''} fill="${colour}"${fitted} xml:space="preserve">${escapeXmlText(piece.text)}</text>`;
  const rule = (y: number) =>
    `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + piece.width)}" y2="${n(y)}" stroke="${colour}" stroke-width="${n(
      Math.max(1, look.size / 14),
    )}"/>`;
  return (
    highlight +
    text +
    (look.underline ? rule(baseline + look.size * 0.12) : '') +
    (look.strike ? rule(baseline - look.size * 0.3) : '')
  );
}

function boxPiece(
  piece: Extract<Placed, { kind: 'box' }>,
  x: number,
  bottom: number,
  paint: Paint,
): string {
  const top = bottom - piece.height;
  const alt =
    piece.alt !== '' && piece.height >= 20
      ? `<text x="${n(x + piece.width / 2)}" y="${n(top + piece.height / 2 + 10 / 3)}" font-family="Inter" font-size="10" fill="${LABEL_COLOUR}" text-anchor="middle">${escapeXmlText(piece.alt)}</text>`
      : '';
  return `<rect x="${n(x)}" y="${n(top)}" width="${n(piece.width)}" height="${n(piece.height)}" fill="${paint.box}" stroke="${paint.grid}"/>${alt}`;
}

function lineSvg(line: DrawnLine, left: number, top: number, paint: Paint): string {
  return line.pieces
    .map((piece) =>
      piece.kind === 'text'
        ? textPiece(piece, left + line.x + piece.x, top + line.baseline, paint)
        : boxPiece(piece, left + line.x + piece.x, top + line.top + line.height, paint),
    )
    .join('');
}

function markerSvg(
  drawn: DrawnMarker,
  left: number,
  line: DrawnLine,
  top: number,
  paint: Paint,
): string {
  const x = left + drawn.x;
  const baseline = top + line.baseline;
  if (drawn.marker.kind === 'check') {
    const side = drawn.look.size * 0.7;
    const ink = escapeXmlAttribute(paint.ink(undefined));
    return `<rect x="${n(x)}" y="${n(baseline - side)}" width="${n(side)}" height="${n(side)}" fill="none" stroke="${ink}"/>${
      drawn.marker.checked
        ? `<path d="M${n(x + side * 0.2)} ${n(baseline - side * 0.5)}l${n(side * 0.25)} ${n(side * 0.3)}l${n(side * 0.4)} ${n(-side * 0.6)}" fill="none" stroke="${ink}"/>`
        : ''
    }`;
  }
  return textPiece(
    { kind: 'text', text: drawn.marker.text, look: drawn.look, x: 0, width: 0 },
    x,
    baseline,
    paint,
  );
}

const borderSvg = (border: DrawnBorder, x: number, width: number, y: number, paint: Paint) =>
  `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + width)}" y2="${n(y)}" stroke="${escapeXmlAttribute(
    paint.ink(border.color),
  )}" stroke-width="${n(border.width)}"/>`;

// A paragraph's shading behind the lines on this page, and its top and bottom borders where its first and last lines
// are.
function decorationSvg(
  drawn: Extract<PreviewBlock['drawn'], { kind: 'paragraph' }>,
  { fromLine, toLine, top, left }: PlacedBlock,
  paint: Paint,
): string {
  const { box, lines } = drawn;
  if (!box) return '';
  const x = left + box.x;
  const first = lines[fromLine];
  const last = lines[toLine - 1];
  const upper = top + (first?.top ?? 0);
  const lower = top + (last ? last.top + last.height : 0);
  const shading =
    drawn.shading && first
      ? `<rect x="${n(x)}" y="${n(upper)}" width="${n(box.width)}" height="${n(lower - upper)}" fill="${escapeXmlAttribute(
          paint.fill(drawn.shading),
        )}"/>`
      : '';
  const topBorder =
    drawn.borders?.top && fromLine === 0
      ? borderSvg(drawn.borders.top, x, box.width, upper - drawn.borders.top.space, paint)
      : '';
  const bottomBorder =
    drawn.borders?.bottom && toLine === lines.length
      ? borderSvg(drawn.borders.bottom, x, box.width, lower + drawn.borders.bottom.space, paint)
      : '';
  return shading + topBorder + bottomBorder;
}

function blockSvg(placedBlock: PlacedBlock, paint: Paint): string {
  const { block, fromLine, toLine, top, left } = placedBlock;
  const { drawn } = block;
  if (drawn.kind === 'paragraph') {
    const lines = drawn.lines.slice(fromLine, toLine);
    const first = drawn.lines[0];
    const marker =
      drawn.marker && fromLine === 0 && first
        ? markerSvg(drawn.marker, left, first, top, paint)
        : '';
    return (
      decorationSvg(drawn, placedBlock, paint) +
      marker +
      lines.map((line) => lineSvg(line, left, top, paint)).join('')
    );
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
              cell.background ? escapeXmlAttribute(paint.fill(cell.background)) : 'none'
            }" stroke="${paint.grid}"/>${cell.lines
              // An exact row clips what does not fit, as the editor does.
              .filter((line) => line.top + line.height <= height + CLIP_SLACK_PX)
              .map((line) => lineSvg(line, x, y, paint))
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
  { label = true, paper = 'light', faces = false }: PreviewOptions = {},
): string {
  const paint = { ...(paper === 'dark' ? DARK : LIGHT), faces };
  const said = label
    ? `<text x="${n(frame.width - frame.left)}" y="${n(frame.height - Math.min(frame.bottom, 48) / 2)}" font-family="Inter" font-size="${LABEL_SIZE_PX}" fill="${LABEL_COLOUR}" text-anchor="end">${APPROXIMATE_LABEL}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(frame.width)}" height="${n(frame.height)}" viewBox="0 0 ${n(
    frame.width,
  )} ${n(frame.height)}"><rect width="100%" height="100%" fill="${escapeXmlAttribute(paint.sheet(pageColor))}"/>${placed
    .map((p) => blockSvg(p, paint))
    .join('')}${said}</svg>`;
}
