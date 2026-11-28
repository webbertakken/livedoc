// A paragraph's lines for a page preview (docs/specs/034-text-documents/agents-and-sync.md "Page previews", "Lines"):
// broken greedily from the advance widths of the Inter faces the previews draw with, at spaces and after hyphens, a
// word wider than the line by character, a line break starting a line. Lengths in CSS pixels. Pure.
import { PREVIEW_ADVANCES, type AdvanceRange } from './preview-advances';

/** The face a preview draws in, and breaks lines by when a run's own face is not carried. */
export const PREVIEW_FACE = 'Inter';

/** A character the bundled faces have no advance for: about an average letter's width, in ems. */
export const PREVIEW_FALLBACK_EM = 0.6;
/** A tab, drawn as this many spaces. */
const TAB_SPACES = 4;

/** How a run is drawn: its size in CSS pixels, its weight and slant, and what else it carries. */
export type Look = {
  readonly size: number;
  /** The face whose widths break its lines: the one the editor draws its font in, when the previews carry it. */
  readonly face?: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  /** `#rrggbb`; black when absent. */
  readonly color?: string;
  /** `#rrggbb` drawn behind the text. */
  readonly highlight?: string;
  /** The CSS font stack the editor draws its font with, for a preview drawn in its faces. */
  readonly stack?: string;
};

export type Piece =
  | { readonly kind: 'text'; readonly text: string; readonly look: Look }
  /** An inline picture: a box of its size, with its alt text. */
  | { readonly kind: 'box'; readonly width: number; readonly height: number; readonly alt: string };

/** A piece placed on its line, `x` from the line's start. */
export type Placed = Piece & { readonly x: number; readonly width: number };

/** A line: its pieces and the width they take, trailing spaces left out. */
export type Line = { readonly pieces: readonly Placed[]; readonly width: number };

function emOf(code: number, ranges: readonly AdvanceRange[]): number {
  for (const range of ranges) {
    const width = range.widths[code - range.from];
    if (width !== undefined) return width === 0 ? PREVIEW_FALLBACK_EM : width / 1000;
  }
  return PREVIEW_FALLBACK_EM;
}

/** The width of `text` on one line at `size` CSS pixels, in `face` (Inter by default). */
export function textWidth(text: string, size: number, bold: boolean, face = PREVIEW_FACE): number {
  const advances = PREVIEW_ADVANCES[face] ?? PREVIEW_ADVANCES[PREVIEW_FACE]!;
  const ranges = bold ? advances.bold : advances.regular;
  let em = 0;
  for (const ch of text) em += emOf(ch.codePointAt(0)!, ranges);
  return em * size;
}

// A word with the spaces after it, a break after a hyphen, or a line break of its own.
const TOKEN = /\n|[^\s-]*-|[^\s-]+[^\S\n]*|[^\S\n]+/g;

type Token = { piece: Piece; width: number; inked: number } | 'break';

function tokensOf(pieces: readonly Piece[]): Token[] {
  const out: Token[] = [];
  for (const piece of pieces) {
    if (piece.kind === 'box') {
      out.push({ piece, width: piece.width, inked: piece.width });
      continue;
    }
    const text = piece.text.replaceAll('\t', ' '.repeat(TAB_SPACES));
    for (const [word] of text.matchAll(TOKEN)) {
      if (word === '\n') {
        out.push('break');
        continue;
      }
      const { size, bold, face } = piece.look;
      out.push({
        piece: { ...piece, text: word },
        width: textWidth(word, size, bold, face),
        inked: textWidth(word.trimEnd(), size, bold, face),
      });
    }
  }
  return out;
}

// A word wider than a whole line, cut where each part fills one.
function cut(piece: Extract<Piece, { kind: 'text' }>, room: number): Token[] {
  const { text, look } = piece;
  const parts: Token[] = [];
  let part = '';
  for (const ch of text) {
    if (part !== '' && textWidth(part + ch, look.size, look.bold, look.face) > room) {
      parts.push(textToken(part, look));
      part = '';
    }
    part += ch;
  }
  parts.push(textToken(part, look));
  return parts;
}

const textToken = (text: string, look: Look): Token => ({
  piece: { kind: 'text', text, look },
  width: textWidth(text, look.size, look.bold, look.face),
  inked: textWidth(text.trimEnd(), look.size, look.bold, look.face),
});

// Neighbouring text of one look drawn as one piece.
function joined(pieces: readonly Placed[]): Placed[] {
  const out: Placed[] = [];
  for (const piece of pieces) {
    const last = out.at(-1);
    if (last?.kind === 'text' && piece.kind === 'text' && last.look === piece.look) {
      out[out.length - 1] = {
        ...last,
        text: last.text + piece.text,
        width: last.width + piece.width,
      };
      continue;
    }
    out.push(piece);
  }
  return out;
}

/** The lines `pieces` break into: the first `first` wide, the rest `rest`. */
export function breakLines(pieces: readonly Piece[], first: number, rest: number): Line[] {
  const lines: Line[] = [];
  let placed: Placed[] = [];
  let x = 0;
  let inked = 0;
  const close = () => {
    lines.push({ pieces: joined(placed), width: inked });
    placed = [];
    x = 0;
    inked = 0;
  };
  const room = () => (lines.length === 0 ? first : rest);
  const queue = tokensOf(pieces);
  while (queue.length > 0) {
    const token = queue.shift()!;
    if (token === 'break') {
      close();
      continue;
    }
    if (placed.length > 0 && x + token.inked > room()) close();
    if (placed.length === 0 && token.inked > room() && token.piece.kind === 'text') {
      const parts = cut(token.piece, room());
      if (parts.length > 1) {
        queue.unshift(...parts);
        continue;
      }
    }
    placed.push({ ...token.piece, x, width: token.width });
    inked = x + token.inked;
    x += token.width;
  }
  close();
  return lines;
}
