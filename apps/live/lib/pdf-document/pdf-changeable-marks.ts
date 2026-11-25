// The marks a person may change on each page (docs/specs/035-pdf-documents/marks.md "Changing a mark": marks the file
// arrived with behave the same): LiveDoc's own from the live changes, then each of the file's own that LiveDoc reads as
// one of its own and that is neither taken as LiveDoc's nor deleted. The file's own are read as each page is drawn and
// put here; they are drawn by the page's picture, so `fileOwn` names them for the overlay to leave alone. A snapshot is
// the same object until the live marks, the deletions of the file's own or the file's own read change.
import type * as Y from 'yjs';
import { PdfLiveChanges, type Mark, type PageName } from '@livedoc/pdf-documents';
import { marksOnPage, type PdfMarksStore } from './pdf-marks-store';

/** A page's marks a person may change, and which of them are the file's own, drawn by the page's picture. */
export type PdfChangeableMarks = {
  readonly marks: readonly Mark[];
  readonly fileOwn: ReadonlySet<string>;
};

export type PdfChangeableByPage = ReadonlyMap<PageName, PdfChangeableMarks>;

export type PdfChangeableStore = {
  get: () => PdfChangeableByPage;
  subscribe: (listener: () => void) => () => void;
  /** The file's own marks of a page as LiveDoc reads them, each time the page is read; the same list changes nothing. */
  putFileMarks: (page: PageName, marks: readonly Mark[]) => void;
};

const NO_IDS: ReadonlySet<string> = new Set();
const NONE: PdfChangeableMarks = { marks: [], fileOwn: NO_IDS };

/** A page's marks a person may change, in a snapshot. */
export const changeableOnPage = (byPage: PdfChangeableByPage, page: PageName): PdfChangeableMarks =>
  byPage.get(page) ?? NONE;

/** The file's own marks a page's picture is drawn without: each one deleted, or taken as LiveDoc's. */
export const fileMarksGone = (doc: Y.Doc): readonly string[] =>
  [...PdfLiveChanges.removed(doc)].flatMap(([id, kind]) => (kind === 'mark' ? [id] : []));

/** LiveDoc's marks, then each of the file's that is neither LiveDoc's now nor gone. */
export function changeableMarks(
  live: readonly Mark[],
  file: readonly Mark[],
  gone: ReadonlySet<string>,
): PdfChangeableMarks {
  const liveIds = new Set(live.map((mark) => mark.id));
  const own = file.filter((mark) => !liveIds.has(mark.id) && !gone.has(mark.id));
  if (own.length === 0) return live.length === 0 ? NONE : { marks: live, fileOwn: NO_IDS };
  return { marks: [...live, ...own], fileOwn: new Set(own.map((mark) => mark.id)) };
}

const sameMarks = (one: readonly Mark[] | undefined, other: readonly Mark[]): boolean =>
  one !== undefined &&
  one.length === other.length &&
  one.every((mark, at) => JSON.stringify(mark) === JSON.stringify(other[at]));

export function pdfChangeableStore(doc: Y.Doc, live: PdfMarksStore): PdfChangeableStore {
  const fileMarks = new Map<PageName, readonly Mark[]>();
  const listeners = new Set<() => void>();
  const removed = doc.getMap('removed');
  const reckon = (): PdfChangeableByPage => {
    const byPage = live.get();
    const gone = new Set(fileMarksGone(doc));
    const pages = new Set([...byPage.keys(), ...fileMarks.keys()]);
    return new Map(
      [...pages].map((page) => [
        page,
        changeableMarks(marksOnPage(byPage, page), fileMarks.get(page) ?? [], gone),
      ]),
    );
  };
  let snapshot = reckon();
  const renew = () => {
    snapshot = reckon();
    for (const listener of [...listeners]) listener();
  };
  let stopLive: (() => void) | null = null;
  return {
    get: () => snapshot,
    subscribe: (listener) => {
      if (listeners.size === 0) {
        stopLive = live.subscribe(renew);
        removed.observeDeep(renew);
        // What changed while none listened.
        snapshot = reckon();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stopLive?.();
        removed.unobserveDeep(renew);
      };
    },
    putFileMarks: (page, marks) => {
      if (sameMarks(fileMarks.get(page), marks)) return;
      fileMarks.set(page, marks);
      renew();
    },
  };
}
