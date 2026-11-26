'use client';

// The marks selected, as the live changes and the file's own hold them now (docs/specs/035-pdf-documents/marks.md
// "Changing a mark"): what restyling and Properties read, kept current as anyone changes them.
import { useMemo, useSyncExternalStore } from 'react';
import type { Mark, PageInfo } from '@livedoc/pdf-documents';
import {
  changeableOnPage,
  type PdfChangeableByPage,
  type PdfChangeableStore,
} from './pdf-changeable-marks';
import type { PdfMarksChosen } from './usePdfMarkSelection';

const NO_MARKS: PdfChangeableByPage = new Map();
const NONE: readonly Mark[] = [];
const neverChanges = () => () => {};
const noMarks = () => NO_MARKS;

export function usePdfChosenMarks({
  pages,
  marks,
  chosen,
}: {
  // The open PDF's pages; none before it is.
  pages: readonly PageInfo[];
  marks: PdfChangeableStore | null;
  // The marks selected; null while none is.
  chosen: PdfMarksChosen | null;
}) {
  const read = marks?.get ?? noMarks;
  const byPage = useSyncExternalStore(marks?.subscribe ?? neverChanges, read, read);
  const page = chosen ? pages[chosen.page] : undefined;
  const selected = useMemo(
    () =>
      chosen && page
        ? changeableOnPage(byPage, page.name).marks.filter((mark) => chosen.ids.includes(mark.id))
        : NONE,
    [byPage, chosen, page],
  );
  return { byPage, page, selected };
}
