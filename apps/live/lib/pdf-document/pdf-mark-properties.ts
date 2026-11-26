// A mark's Properties (docs/specs/035-pdf-documents/marks.md "Changing a mark": Properties): what the side panel reads
// of one mark, in order; its subject changed as one change under the person's own origin, so it is one step of their
// undo; and its look given to its kind's tool, "Make this look the default".
import type * as Y from 'yjs';
import {
  Mark as Marks,
  MARK_KIND_LABELS,
  PDF_MARK_SUBJECT_MAX_CHARS,
  PdfChange,
  type LineStyle,
  type Mark,
} from '@livedoc/pdf-documents';
import { colourName } from '@/components/colour/colour-options';
import { adopting, changeAsOne, markIn } from './pdf-mark-change';
import { isFilledKind, isLinedKind, setMarkColour, setMarkLine, type LookedKind } from './pdf-mark-looks';
import { fillOf, lineStyleOf, widthOf } from './pdf-mark-restyle';
import { stampWhen } from './pdf-stamp';

/** One row the panel reads: its label and its value, as a person reads it. */
export type PropertyRow = { readonly label: string; readonly value: string };

/** Each line style as Format > Line style names it. */
const STYLE_NAMES: Readonly<Record<LineStyle, string>> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
  'dash-dot': 'Dash dot',
  'long-dashes': 'Long dashes',
};

/** A mark's words: a Text's or a Callout's typed, a text mark's covered, a stamp's lines; null for none. */
function wordsOf(mark: Mark): string | null {
  if (Marks.isTyped(mark)) return mark.words || null;
  if (Marks.isText(mark)) return mark.text || null;
  return mark.kind === 'stamp' ? mark.lines.join(' ') : null;
}

/** The rows above and below the subject's field: Kind and Author before it, the rest after. */
export function propertyRows(mark: Mark): { before: PropertyRow[]; after: PropertyRow[] } {
  const width = widthOf(mark);
  const style = lineStyleOf(mark);
  const fill = fillOf(mark);
  const words = wordsOf(mark);
  return {
    before: [
      { label: 'Kind', value: MARK_KIND_LABELS[mark.kind] },
      { label: 'Author', value: mark.author.trim() || 'Unknown' },
    ],
    after: [
      { label: 'Made', value: stampWhen(mark.createdAt) },
      { label: 'Changed', value: stampWhen(mark.modifiedAt) },
      { label: 'Colour', value: colourName(mark.colour) },
      { label: 'Opacity', value: `${Math.round(mark.opacity * 100)}%` },
      ...(width === undefined ? [] : [{ label: 'Line width', value: `${width} pt` }]),
      ...(style === undefined ? [] : [{ label: 'Line style', value: STYLE_NAMES[style] }]),
      ...(fill === undefined ? [] : [{ label: 'Fill', value: fill ? colourName(fill) : 'None' }]),
      ...(words === null ? [] : [{ label: 'Words', value: words }]),
    ],
  };
}

/** A mark's subject as the field shows it: its own, else its kind's name. */
export const subjectShown = (mark: Mark): string => mark.subject ?? MARK_KIND_LABELS[mark.kind];

/**
 * A mark's subject changed as one change, `now` its time of change: trimmed and cut to its most, and its kind's name or
 * nothing taking it back to none. Answers whether it changed, with whether it was cleared; null where nothing changed.
 */
export function changeSubject(
  doc: Y.Doc,
  id: string,
  typed: string,
  now: number,
  fileOwn: ReadonlyMap<string, Mark>,
): { cleared: boolean } | null {
  const mark = markIn(doc, id, fileOwn);
  if (!mark) return null;
  const trimmed = typed.trim().slice(0, PDF_MARK_SUBJECT_MAX_CHARS).trim();
  const subject = trimmed === MARK_KIND_LABELS[mark.kind] ? '' : trimmed;
  if (subject === (mark.subject ?? '')) return null;
  const change: PdfChange = subject
    ? PdfChange.changeMark(id, { subject, modifiedAt: now })
    : { root: 'marks', id, set: { modifiedAt: now }, unset: ['subject'] };
  return changeAsOne(doc, [...adopting(doc, mark), change]) ? { cleared: !subject } : null;
}

/** Whether "Make this look the default" is offered for a mark: every kind but a stamp, whose colour is its own. */
export const mayDefaultLook = (mark: Mark): mark is Mark & { kind: LookedKind } => mark.kind !== 'stamp';

/** The mark's colour, and its width, line style and fill where its kind's tool keeps them, made its tool's look. */
export function defaultLook(mark: Mark): void {
  if (!mayDefaultLook(mark)) return;
  setMarkColour(mark.kind, mark.colour);
  if (!isLinedKind(mark.kind)) return;
  const width = widthOf(mark);
  if (width !== undefined) setMarkLine(mark.kind, { width });
  setMarkLine(mark.kind, { lineStyle: lineStyleOf(mark) ?? 'solid' });
  if (isFilledKind(mark.kind)) setMarkLine(mark.kind, { fill: fillOf(mark) ?? null });
}
