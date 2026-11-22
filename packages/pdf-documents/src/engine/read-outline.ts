// The outline and a page's links (docs/specs/035-pdf-documents/security.md "Links and actions"): where each leads is
// read and named; nothing is followed or performed here.
import { type Outline, type OutlineItem, type PageLink } from '../engine-contract';
import { LinkTarget, type PdfActionKind } from '../link-target';
import { PageName } from '../page-name';
import {
  PDF_LINK_MAX_CHARS,
  PDF_MAX_TREE_DEPTH,
  PDF_NAME_MAX_CHARS,
  PDF_OUTLINE_MAX_ITEMS,
  PDF_PAGE_MAX_LINKS,
} from '../limits';
import type { ReaderFile } from './reader-file';

// FPDFAction_GetType's answers: a place here, another file, an address; the rest are named and never performed.
const ACTION_GO_TO = 1;
const ACTION_OTHER_FILE = 2;
const ACTION_ADDRESS = 3;
const ACTIONS: Readonly<Record<number, PdfActionKind>> = { 4: 'launch', 5: 'embedded-file' };

/** The place in this document a destination names, or null where it names none that is here. */
function placeOf(file: ReaderFile, destination: number): LinkTarget | null {
  const { p } = file;
  const index = p.FPDFDest_GetDestPageIndex(file.doc, destination);
  if (index < 0 || index >= file.count) return null;
  // Three flags (whether x, y and zoom are named), then the three numbers.
  const out = file.alloc(24);
  const located = p.FPDFDest_GetLocationInPage(
    destination,
    out,
    out + 4,
    out + 8,
    out + 12,
    out + 16,
    out + 20,
  );
  const named = (flag: number, value: number): number | null => {
    const read = file.runtime.getValue(value, 'float');
    return located && file.runtime.getValue(flag, 'i32') !== 0 && Number.isFinite(read)
      ? read
      : null;
  };
  const place: LinkTarget = {
    kind: 'place',
    page: PageName.ofObject(p.EPDFDoc_GetPageObjectNumberByIndex(file.doc, index)),
    x: named(out, out + 12),
    y: named(out + 4, out + 16),
  };
  file.free(out);
  return place;
}

/**
 * What an action of the file asks: read and named, never performed (security.md "Links and actions"). An action is
 * read before any destination: the reader answers the place another file's link names as a place in this one.
 */
function targetOf(file: ReaderFile, action: number): LinkTarget | null {
  const { p } = file;
  const kind = p.FPDFAction_GetType(action);
  if (kind === ACTION_GO_TO) {
    const destination = p.FPDFAction_GetDest(file.doc, action);
    return destination ? placeOf(file, destination) : null;
  }
  if (kind === ACTION_ADDRESS) {
    // One past the limit, so an address too long is seen to be.
    return LinkTarget.ofAddress(
      file.writtenBytes(PDF_LINK_MAX_CHARS + 1, (buffer, size) =>
        p.FPDFAction_GetURIPath(file.doc, action, buffer, size),
      ),
    );
  }
  if (kind === ACTION_OTHER_FILE) {
    const path = file.writtenBytes(PDF_NAME_MAX_CHARS, (buffer, size) =>
      p.FPDFAction_GetFilePath(action, buffer, size),
    );
    return { kind: 'file', path };
  }
  return { kind: 'action', action: ACTIONS[kind] ?? 'other' };
}

/** The bookmarks in reading order, at most `most`; a walk never reads a bookmark twice, nor past the depth limit. */
export function readOutline(file: ReaderFile, most = PDF_OUTLINE_MAX_ITEMS): Outline {
  const { p } = file;
  const items: OutlineItem[] = [];
  if (!file.doc) return { items, cut: false };
  const read = new Set<number>();
  let cut = false;
  const walk = (parent: number, depth: number): void => {
    if (depth >= PDF_MAX_TREE_DEPTH) return;
    for (
      let item = p.FPDFBookmark_GetFirstChild(file.doc, parent);
      item !== 0 && !read.has(item) && !cut;
      item = p.FPDFBookmark_GetNextSibling(file.doc, item)
    ) {
      if (items.length >= most) {
        cut = true;
        return;
      }
      read.add(item);
      const action = p.FPDFBookmark_GetAction(item);
      const destination = action ? 0 : p.FPDFBookmark_GetDest(file.doc, item);
      items.push({
        title: file.written(PDF_NAME_MAX_CHARS, (buffer, size) =>
          p.FPDFBookmark_GetTitle(item, buffer, size),
        ),
        depth,
        target: action ? targetOf(file, action) : destination ? placeOf(file, destination) : null,
      });
      walk(item, depth + 1);
    }
  };
  walk(0, 0);
  return { items, cut };
}

/** The links on a page, at most `most`, each with its box and where it leads. */
export function readLinks(
  file: ReaderFile,
  index: number,
  most = PDF_PAGE_MAX_LINKS,
): readonly PageLink[] {
  const { p } = file;
  const links: PageLink[] = [];
  file.withPage(index, (page) => {
    // Where the walk is, the link it found, then the link's box: left, top, right, bottom.
    const out = file.alloc(24);
    file.heap.fill(0, out, out + 24);
    while (links.length < most && p.FPDFLink_Enumerate(page, out, out + 4)) {
      const link = file.runtime.getValue(out + 4, 'i32');
      if (!p.FPDFLink_GetAnnotRect(link, out + 8)) continue;
      const side = (at: number): number => {
        const read = file.runtime.getValue(out + 8 + at * 4, 'float');
        return Number.isFinite(read) ? read : 0;
      };
      const action = p.FPDFLink_GetAction(link);
      const destination = action ? 0 : p.FPDFLink_GetDest(file.doc, link);
      const target = destination
        ? placeOf(file, destination)
        : action
          ? targetOf(file, action)
          : null;
      if (target) links.push({ rect: [side(0), side(3), side(2), side(1)], target });
    }
    file.free(out);
  });
  return links;
}
