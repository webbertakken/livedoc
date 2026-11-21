// The marks of a PDF document as its surface reads them (docs/specs/035-pdf-documents/marks.md "Together"): by page,
// renewed whenever the live changes' marks change, whoever changed them. A snapshot is the same object until then, so
// a page redraws only when a mark on the document changed.
import type * as Y from 'yjs';
import { PdfLiveChanges, type Mark, type PageName } from '@livedoc/pdf-documents';

export type PdfMarksByPage = ReadonlyMap<PageName, readonly Mark[]>;

export type PdfMarksStore = {
  get: () => PdfMarksByPage;
  subscribe: (listener: () => void) => () => void;
};

const NONE: readonly Mark[] = [];

/** The marks on one page of a snapshot. */
export const marksOnPage = (marks: PdfMarksByPage, page: PageName): readonly Mark[] =>
  marks.get(page) ?? NONE;

function byPage(doc: Y.Doc): PdfMarksByPage {
  const pages = new Map<PageName, Mark[]>();
  for (const mark of PdfLiveChanges.marks(doc)) {
    const held = pages.get(mark.page);
    if (held) held.push(mark);
    else pages.set(mark.page, [mark]);
  }
  return pages;
}

export function pdfMarksStore(doc: Y.Doc): PdfMarksStore {
  let snapshot = byPage(doc);
  const listeners = new Set<() => void>();
  const marks = doc.getMap('marks');
  const renew = () => {
    snapshot = byPage(doc);
    for (const listener of listeners) listener();
  };
  return {
    get: () => snapshot,
    subscribe: (listener) => {
      if (listeners.size === 0) marks.observeDeep(renew);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) marks.unobserveDeep(renew);
      };
    },
  };
}
