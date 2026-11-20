// The page drawn at its setup (docs/specs/034-text-documents/page-layout.md "Page setup"): the first section's paper,
// margins and colour, read live so a margin dragged on the ruler, by anyone, redraws the page.
import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  MIN_TEXT_SIDE_PT,
  TextDocumentState,
  type PageSetup,
  type Section,
} from '@livedoc/text-documents';
import { paperFill } from './text-document-paper';

export type MarginSide = 'left' | 'right';

/** The setup with one side's margin at `pt`, held so the text area keeps `MIN_TEXT_SIDE_PT`. */
export function setMargin(setup: PageSetup, side: MarginSide, pt: number): PageSetup {
  const other = side === 'left' ? setup.margins.right : setup.margins.left;
  const held =
    Math.round(Math.min(Math.max(pt, 0), setup.width - other - MIN_TEXT_SIDE_PT) * 1000) / 1000;
  return { ...setup, margins: { ...setup.margins, [side]: held } };
}

/** The text area's width. */
export const textWidthOf = (setup: PageSetup): number =>
  setup.width - setup.margins.left - setup.margins.right;

/** The page's sides, margins and colour as CSS variables, read by the page's classes (a phone keeps its own). */
export function pageBox(setup: PageSetup): CSSProperties {
  const m = setup.margins;
  return {
    '--page-width': `${setup.width}pt`,
    '--page-height': `${setup.height}pt`,
    '--page-top': `${m.top}pt`,
    '--page-bottom': `${m.bottom}pt`,
    '--page-left': `${m.left}pt`,
    '--page-right': `${m.right}pt`,
    ...(setup.pageColor ? { '--page-colour': paperFill(setup.pageColor) } : {}),
  } as CSSProperties;
}

/** The pageless column's width at medium, 8 in (default until View > Text width is built). */
export const PAGELESS_TEXT_WIDTH_PT = 576;
/** The room pageless keeps above the first line and at each side of the column: 0.5 in (default). */
export const PAGELESS_EDGE_PT = 36;
const PX_PER_PT = 96 / 72;

/** The pageless column's width in points for `available` CSS pixels at zoom `scale`, never under an inch. */
export function pagelessColumnPt(available: number, scale: number): number {
  const room = available / scale / PX_PER_PT - 2 * PAGELESS_EDGE_PT;
  return Math.max(MIN_TEXT_SIDE_PT, Math.min(PAGELESS_TEXT_WIDTH_PT, Math.round(room)));
}

/**
 * The page as pageless draws it: the column as its width with no side margins, room above and below, and the
 * setup's colour. The setup itself is kept, unused, for printing and switching back.
 */
export const pagelessSetup = (setup: PageSetup, column: number): PageSetup => ({
  ...setup,
  width: column,
  margins: { top: PAGELESS_EDGE_PT, bottom: PAGELESS_EDGE_PT, left: 0, right: 0 },
});

/** The page as the document has it now: its first section, and whether it is pageless. */
export type TextDocumentPage = { readonly section: Section; readonly pageless: boolean };

/** The page, kept current as the live state changes; a new document's until the state is bound. */
export function useTextDocumentPage(
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  ready: boolean,
): TextDocumentPage {
  const [page, setPage] = useState<TextDocumentPage>(() => ({
    section: TextDocumentState.section(TextDocumentState.load(), format),
    pageless: false,
  }));
  useEffect(() => {
    const doc = liveDoc.current;
    if (!ready || !doc) return;
    const meta = TextDocumentState.metaType(doc);
    const read = () =>
      setPage({
        section: TextDocumentState.section(doc, format),
        pageless: TextDocumentState.pageless(doc),
      });
    read();
    meta.observe(read);
    return () => meta.unobserve(read);
  }, [liveDoc, format, ready]);
  return page;
}

/** The pageless column's width in points for the scroller it is drawn in, kept current as that resizes. */
export function usePagelessColumn(
  scroller: RefObject<HTMLElement | null>,
  scale: number,
  pageless: boolean,
): number {
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const element = scroller.current;
    if (!pageless || !element) return;
    const read = () => setAvailable(element.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scroller, pageless]);
  // Before the scroller is measured, the column at its full width.
  return available > 0 ? pagelessColumnPt(available, scale) : PAGELESS_TEXT_WIDTH_PT;
}
