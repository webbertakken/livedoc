// A cell's text broken into lines no wider than its room (docs/specs/029-sheets/sheet.md "Row height"), measured
// by text-measure.ts, so the lines are the same wherever they are worked out. The grid and the static render draw
// these very lines, which is why an automatic row never cuts one off. Greedy: a line takes every word that fits. Pure.
import { advanceUnits, faceTable, isMark, isWide, type TextFace } from './text-measure';

const SPACE = 0x20;
const HYPHEN = 0x2d;
const JOINER = 0x200d;
// The characters the advance table holds end here; no mark sits below U+0300.
const ASCII_END = 0x7f;
const MARKS_FROM = 0x0300;

// Where the character starting at `i` ends: a surrogate pair, the marks on it, and what a joiner ties to it.
function clusterEnd(text: string, i: number): number {
  let end = i + (text.codePointAt(i)! > 0xffff ? 2 : 1);
  while (end < text.length) {
    const code = text.charCodeAt(end);
    if (!isMark(code)) break;
    end++;
    if (code === JOINER && end < text.length) end += text.codePointAt(end)! > 0xffff ? 2 : 1;
  }
  return end;
}

function wrapParagraph(
  text: string,
  roomUnits: number,
  table: ReturnType<typeof faceTable>,
  out: string[],
  maxLines: number,
): void {
  let start = 0;
  // The line's width up to `i`, and the last place it may break: where the line would end and the next begin.
  let width = 0;
  let breakEnd = -1;
  let breakNext = -1;
  let widthAtNext = 0;
  let i = 0;
  while (i < text.length) {
    // Plain ASCII with no mark on it, nearly all text, is one character from the table; the rest is read with care.
    let code = text.charCodeAt(i);
    let end = i + 1;
    let units: number;
    if (
      code >= SPACE &&
      code < ASCII_END &&
      (end >= text.length || text.charCodeAt(end) < MARKS_FROM)
    ) {
      units = table.units[code - SPACE]!;
    } else {
      code = text.codePointAt(i)!;
      end = clusterEnd(text, i);
      units = advanceUnits(code, table);
    }
    if (code === SPACE) {
      // A run of spaces is a place to break: the line ends before it and the next starts after it. Spaces never
      // push a line over; they hang at its end.
      let after = end;
      let run = units;
      while (after < text.length && text.charCodeAt(after) === SPACE) {
        after++;
        run += units;
      }
      if (i > start) {
        breakEnd = i;
        breakNext = after;
        widthAtNext = width + run;
      }
      width += run;
      i = after;
      continue;
    }
    if (width + units > roomUnits && i > start) {
      if (breakNext > start) {
        out.push(text.slice(start, breakEnd));
        start = breakNext;
        width -= widthAtNext;
      } else {
        // No place to break in this line: a word wider than the room breaks inside itself.
        out.push(text.slice(start, i));
        start = i;
        width = 0;
      }
      breakEnd = breakNext = -1;
      if (out.length >= maxLines) return;
      continue;
    }
    width += units;
    i = end;
    // After a hyphen, and after a full-width character, the line may break with nothing dropped.
    if ((code === HYPHEN || isWide(code)) && i < text.length) {
      breakEnd = breakNext = i;
      widthAtNext = width;
    }
  }
  out.push(text.slice(start));
}

// The lines of `text` in `room` px, at `px` in `face`; at most `maxLines` of them (the rest is left out: its row is
// as tall as a row goes).
export function wrapLines(
  text: string,
  room: number,
  px: number,
  face: TextFace,
  maxLines = Infinity,
): string[] {
  const table = faceTable(face);
  const roomUnits = (Math.max(0, room) * 1000) / px;
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (out.length >= maxLines) break;
    wrapParagraph(
      paragraph.endsWith('\r') ? paragraph.slice(0, -1) : paragraph,
      roomUnits,
      table,
      out,
      maxLines,
    );
  }
  return out.length > maxLines ? out.slice(0, maxLines) : out;
}
