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

/** The first section, kept current as the live state changes; a new document's until the state is bound. */
export function useTextDocumentSection(
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  ready: boolean,
): Section {
  const [section, setSection] = useState<Section>(() =>
    TextDocumentState.section(TextDocumentState.load(), format),
  );
  useEffect(() => {
    const doc = liveDoc.current;
    if (!ready || !doc) return;
    const meta = TextDocumentState.metaType(doc);
    const read = () => setSection(TextDocumentState.section(doc, format));
    read();
    meta.observe(read);
    return () => meta.unobserve(read);
  }, [liveDoc, format, ready]);
  return section;
}
