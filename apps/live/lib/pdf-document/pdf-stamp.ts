// Placing a stamp (docs/specs/035-pdf-documents/marks.md "Stamps"): its colour by its tone, its words fixed as it is
// placed (a dynamic stamp's who and when), its box at its natural size, at most a third of the page's width, centred
// on the press and held to the page, and the mark written in one change. The state names its stored file the first
// time anything is changed (live-editing-and-storage.md "The layout").
import type * as Y from 'yjs';
import { standardColours, type BlobKey } from '@livedoc/document';
import {
  Mark,
  PdfLiveChanges,
  StampLayout,
  type Box,
  type PageName,
  type PagePoint,
  type PdfLimitRefusal,
  type Stamp,
  type StampTone,
} from '@livedoc/pdf-documents';
import { PDF_LOCAL_ORIGIN } from './pdf-undo';

const strong = (name: StampTone): string =>
  standardColours('strong', 'light').find((colour) => colour.name === name)!.hex;

/** (default) Each tone's colour: the colour picker's strong tone for light paper. */
export const STAMP_COLOURS: Readonly<Record<StampTone, string>> = {
  green: strong('green'),
  red: strong('red'),
  blue: strong('blue'),
};

/** (default) The widest a stamp is placed, as a share of its page's width. */
const STAMP_MAX_PAGE_SHARE = 1 / 3;

/** (default) The months as a dynamic stamp writes them: English, cut to three letters, whatever the browser's language. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const twoDigits = (n: number): string => String(n).padStart(2, '0');

/** The browser's date and 24-hour time as a dynamic stamp writes it: "21 Nov 2026, 14:02". */
export function stampWhen(now: number): string {
  const when = new Date(now);
  const day = `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`;
  return `${day}, ${twoDigits(when.getHours())}:${twoDigits(when.getMinutes())}`;
}

/** A stamp's words as placed: its name in capitals, and a dynamic stamp's who and when below it. */
export function stampLines(stamp: Stamp, by: { author: string; now: number }): string[] {
  const name = stamp.name.toUpperCase();
  if (!stamp.dynamic) return [name];
  const who = by.author.trim();
  const when = stampWhen(by.now);
  return [name, who === '' ? when : `by ${who}, ${when}`];
}

/** A stamp's category in telemetry (marks.md "Telemetry and observability": `Stamp.<Standard|Dynamic|Custom>`). */
export const stampKindName = (stamp: Stamp): 'Standard' | 'Dynamic' =>
  stamp.dynamic ? 'Dynamic' : 'Standard';

const within = (n: number, low: number, high: number): number => Math.max(low, Math.min(n, high));

/** Where a stamp of these words lies, placed by a press on a page: its natural size, centred, held to the page. */
export function placeStamp(lines: readonly string[], at: PagePoint, page: Box): Box {
  const [pageLeft, pageBottom, pageRight, pageTop] = page;
  const natural = StampLayout.natural(lines);
  const scale = Math.min(1, ((pageRight - pageLeft) * STAMP_MAX_PAGE_SHARE) / natural.width);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const left = within(at.x - width / 2, pageLeft, pageRight - width);
  const bottom = within(at.y - height / 2, pageBottom, pageTop - height);
  return [left, bottom, left + width, bottom + height];
}

export type StampMade =
  { ok: true; mark: Mark } | { ok: false; reason: PdfLimitRefusal | 'no_stamp' };

/** A stamp placed by a press on a page, its words fixed now, as one change. */
export function addStamp(
  doc: Y.Doc,
  where: { page: PageName; stored: { blob: BlobKey; pages: number }; box: Box },
  stamp: Stamp,
  at: PagePoint,
  by: { author: string; now: number; id: string },
): StampMade {
  const lines = stampLines(stamp, by);
  const mark = Mark.stamp({
    id: by.id,
    page: where.page,
    colour: STAMP_COLOURS[stamp.tone],
    opacity: 1,
    author: by.author,
    createdAt: by.now,
    rect: placeStamp(lines, at, where.box),
    stamp: stamp.id,
    lines,
  });
  if (!mark) return { ok: false, reason: 'no_stamp' };
  let refusal: PdfLimitRefusal | null = null;
  doc.transact(() => {
    if (!PdfLiveChanges.stored(doc)) PdfLiveChanges.setStored(doc, where.stored, PDF_LOCAL_ORIGIN);
    refusal = PdfLiveChanges.addMark(doc, mark, PDF_LOCAL_ORIGIN);
  }, PDF_LOCAL_ORIGIN);
  return refusal ? { ok: false, reason: refusal } : { ok: true, mark };
}
