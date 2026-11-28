// What makes laid-out pages a tagged, navigable PDF (plan 0019 blueprint "PR 14f1"): the structure tree from the
// pages' tags, each drawn item it names marked with its own MCID, every other item an artifact; links as annotations,
// each a Link element's object; the outline from the headings. ISO 32000-1 14.7 (structure), 14.8 (tagged PDF),
// 12.3.3 (outline), 12.5.6.5 (link annotations).
import {
  PdfArray,
  PdfBool,
  PdfDict,
  PdfName,
  PdfNull,
  PdfNumber,
  PdfString,
  type PDF,
  type PdfObject,
  type PdfRef,
} from '@libpdf/core';

/** The standard structure types the pages' tags take (ISO 32000-1 14.8.4). */
export type LaidOutRole =
  | 'Sect'
  | 'Div'
  | 'H1'
  | 'H2'
  | 'H3'
  | 'H4'
  | 'H5'
  | 'H6'
  | 'P'
  | 'L'
  | 'LI'
  | 'Lbl'
  | 'LBody'
  | 'Table'
  | 'THead'
  | 'TBody'
  | 'TR'
  | 'TH'
  | 'TD'
  | 'Figure'
  | 'Formula'
  | 'Link'
  | 'Note'
  | 'BlockQuote'
  | 'Code'
  | 'Caption'
  | 'TOC'
  | 'TOCI';

/** A drawn item, by its page and its place among the page's items. */
export type LaidOutItemRef = { readonly item: readonly [page: number, index: number] };

/** An element of the pages' structure, in reading order: its kids are elements and drawn items. */
export type LaidOutTag = {
  readonly role: LaidOutRole;
  /** A picture's or a formula's words for who cannot see it. */
  readonly alt?: string;
  readonly lang?: string;
  readonly kids: readonly (LaidOutTag | LaidOutItemRef)[];
};

/** A heading as the outline lists it: its words, level 1 to 6, page and top (points from the page's top). */
export type LaidOutHeading = {
  readonly title: string;
  readonly level: number;
  readonly page: number;
  readonly top: number;
};

/** Where a drawn item is marked: its MCID on its page and the element it belongs to. */
export type Marked = { readonly mcid: number; readonly role: LaidOutRole };

const keyOf = (page: number, index: number): string => `${page}:${index}`;

const isRef = (kid: LaidOutTag | LaidOutItemRef): kid is LaidOutItemRef => 'item' in kid;

/**
 * Each tagged item's MCID, numbered on its page in reading order; `isLink` says which items are links, which are
 * annotations, not content, and take no MCID.
 */
export function markedItems(
  tags: readonly LaidOutTag[],
  isLink: (page: number, index: number) => boolean,
): ReadonlyMap<string, Marked> {
  const marked = new Map<string, Marked>();
  const next = new Map<number, number>();
  const walk = (tag: LaidOutTag) => {
    for (const kid of tag.kids) {
      if (!isRef(kid)) {
        walk(kid);
        continue;
      }
      const [page, index] = kid.item;
      const key = keyOf(page, index);
      if (marked.has(key) || isLink(page, index)) continue;
      const mcid = next.get(page) ?? 0;
      next.set(page, mcid + 1);
      marked.set(key, { mcid, role: tag.role });
    }
  };
  for (const tag of tags) walk(tag);
  return marked;
}

export const Marked = { keyOf } as const;

/** A destination at a place on a page: the page, its top as PDF space says it, zoom unchanged. */
export const destinationOf = (page: PdfRef, top: number): PdfArray =>
  PdfArray.of(page, PdfName.of('XYZ'), PdfNull.instance, PdfNumber.of(top), PdfNull.instance);

/** The pages as the structure tree reaches them: each page's ref and height, each link's annotation and its key. */
export type Written = {
  readonly pages: readonly { readonly ref: PdfRef; readonly height: number }[];
  /** Each link item's annotation, by `Marked.keyOf`. */
  readonly links: ReadonlyMap<string, { readonly dict: PdfDict; readonly ref: PdfRef }>;
  readonly marked: ReadonlyMap<string, Marked>;
};

/** Writes the structure tree and marks the file as tagged; nothing where there are no tags. */
export function writeStructure(pdf: PDF, tags: readonly LaidOutTag[], written: Written): void {
  if (tags.length === 0) return;
  const root = PdfDict.of({ Type: PdfName.of('StructTreeRoot') });
  const rootRef = pdf.register(root);
  // Each page's MCIDs, the element each belongs to; then each link's element, by its annotation's key.
  const byPage = written.pages.map((): PdfRef[] => []);
  const objects: [number, PdfRef][] = [];
  let nextKey = written.pages.length;
  const element = (tag: LaidOutTag, parent: PdfRef): PdfRef => {
    const dict = PdfDict.of({
      Type: PdfName.of('StructElem'),
      S: PdfName.of(tag.role),
      P: parent,
    });
    const ref = pdf.register(dict);
    if (tag.alt !== undefined) dict.set('Alt', PdfString.fromString(tag.alt));
    if (tag.lang !== undefined) dict.set('Lang', PdfString.fromString(tag.lang));
    const kids: PdfObject[] = [];
    for (const kid of tag.kids) {
      if (!isRef(kid)) {
        kids.push(element(kid, ref));
        continue;
      }
      const [page, index] = kid.item;
      const at = written.pages[page];
      if (!at) continue;
      const key = keyOf(page, index);
      const link = written.links.get(key);
      if (link) {
        const parentKey = nextKey;
        nextKey += 1;
        link.dict.set('StructParent', PdfNumber.of(parentKey));
        objects.push([parentKey, ref]);
        kids.push(PdfDict.of({ Type: PdfName.of('OBJR'), Obj: link.ref, Pg: at.ref }));
        continue;
      }
      const marked = written.marked.get(key);
      if (!marked) continue;
      byPage[page]![marked.mcid] = ref;
      kids.push(
        PdfDict.of({ Type: PdfName.of('MCR'), Pg: at.ref, MCID: PdfNumber.of(marked.mcid) }),
      );
    }
    dict.set('K', new PdfArray(kids));
    return ref;
  };
  const document = PdfDict.of({
    Type: PdfName.of('StructElem'),
    S: PdfName.of('Document'),
    P: rootRef,
  });
  const documentRef = pdf.register(document);
  document.set('K', new PdfArray(tags.map((tag) => element(tag, documentRef))));
  const nums: PdfObject[] = [];
  byPage.forEach((refs, page) => {
    nums.push(PdfNumber.of(page), new PdfArray(refs));
  });
  for (const [key, ref] of objects) nums.push(PdfNumber.of(key), ref);
  root.set('K', documentRef);
  root.set('ParentTree', pdf.register(PdfDict.of({ Nums: new PdfArray(nums) })));
  root.set('ParentTreeNextKey', PdfNumber.of(nextKey));
  const catalog = pdf.getCatalog();
  catalog.set('StructTreeRoot', rootRef);
  catalog.set('MarkInfo', PdfDict.of({ Marked: PdfBool.TRUE }));
}

/** Writes the outline from the headings, nested by level; nothing where there are none. */
export function writeOutline(
  pdf: PDF,
  headings: readonly LaidOutHeading[],
  pages: Written['pages'],
): boolean {
  type Entry = { dict: PdfDict; ref: PdfRef; level: number; kids: Entry[] };
  const rootDict = PdfDict.of({ Type: PdfName.of('Outlines') });
  const root: Entry = { dict: rootDict, ref: pdf.register(rootDict), level: 0, kids: [] };
  const open: Entry[] = [root];
  for (const heading of headings) {
    const page = pages[heading.page];
    if (!page) continue;
    const level = Math.min(6, Math.max(1, Math.round(heading.level)));
    while (open.length > 1 && open.at(-1)!.level >= level) open.pop();
    const parent = open.at(-1)!;
    const dict = PdfDict.of({
      Title: PdfString.fromString(heading.title),
      Parent: parent.ref,
      Dest: destinationOf(page.ref, page.height - heading.top),
    });
    const entry: Entry = { dict, ref: pdf.register(dict), level, kids: [] };
    parent.kids.push(entry);
    open.push(entry);
  }
  if (root.kids.length === 0) return false;
  // Every entry open: its Count the entries beneath it.
  const link = (entry: Entry): number => {
    let count = 0;
    entry.kids.forEach((kid, at) => {
      if (at > 0) kid.dict.set('Prev', entry.kids[at - 1]!.ref);
      if (at < entry.kids.length - 1) kid.dict.set('Next', entry.kids[at + 1]!.ref);
      count += 1 + link(kid);
    });
    if (entry.kids.length > 0) {
      entry.dict.set('First', entry.kids[0]!.ref);
      entry.dict.set('Last', entry.kids.at(-1)!.ref);
      entry.dict.set('Count', PdfNumber.of(count));
    }
    return count;
  };
  link(root);
  const catalog = pdf.getCatalog();
  catalog.set('Outlines', root.ref);
  catalog.set('PageMode', PdfName.of('UseOutlines'));
  return true;
}
