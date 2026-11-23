// A page's tags (docs/specs/035-pdf-documents/accessibility.md "The accessible tree"): the file's structure tree as it
// reaches the page, its role map followed, and the marked content each of the page's characters is drawn in.
import { PageText } from '../page-text';
import { type PageTags, type TagElement, type TagKid } from '../page-tags';
import {
  PDF_MAX_TREE_DEPTH,
  PDF_NAME_MAX_CHARS,
  PDF_PROPERTY_MAX_CHARS,
  PDF_TREE_MAX_NODES_A_PAGE,
} from '../limits';
import type { ReaderFile } from './reader-file';

const ARTIFACT = 'Artifact';

export type TagLimits = {
  /** The most elements read: past it the tags are cut. */
  readonly most?: number;
  /** The deepest an element is read, the page's top elements at 1: past it the tags are cut. */
  readonly deepest?: number;
};

/** The page's tags, or null where there is no such page. */
export function readPageTags(
  file: ReaderFile,
  index: number,
  { most = PDF_TREE_MAX_NODES_A_PAGE, deepest = PDF_MAX_TREE_DEPTH }: TagLimits = {},
): PageTags | null {
  const { p } = file;
  return file.withPage(index, (page) => {
    const tree = p.FPDF_StructTree_GetForPage(page);
    if (!tree) return { elements: [], cut: false };
    let read = 0;
    let cut = false;
    const text = (element: number, ask: typeof p.FPDF_StructElement_GetAltText, chars: number) =>
      file.written(chars, (buffer, size) => ask(element, buffer, size));
    const elementOf = (element: number, depth: number): TagElement | null => {
      read += 1;
      if (depth > deepest || read > most) {
        cut = true;
        return null;
      }
      const kids: TagKid[] = [];
      const count = Math.max(p.FPDF_StructElement_CountChildren(element), 0);
      for (let at = 0; at < count && !cut; at += 1) {
        const child = p.FPDF_StructElement_GetChildAtIndex(element, at);
        const kid = child
          ? elementOf(child, depth + 1)
          : p.FPDF_StructElement_GetChildMarkedContentID(element, at);
        // A kid on another page, or an object rather than content, has no id here.
        if (kid !== null && kid !== -1) kids.push(kid);
      }
      return {
        type: text(element, p.FPDF_StructElement_GetType, PDF_NAME_MAX_CHARS),
        alt: text(element, p.FPDF_StructElement_GetAltText, PDF_PROPERTY_MAX_CHARS),
        actual: text(element, p.FPDF_StructElement_GetActualText, PDF_PROPERTY_MAX_CHARS),
        lang: text(element, p.FPDF_StructElement_GetLang, PDF_NAME_MAX_CHARS),
        kids,
      };
    };
    try {
      const elements: TagElement[] = [];
      const count = Math.max(p.FPDF_StructTree_CountChildren(tree), 0);
      for (let at = 0; at < count && !cut; at += 1) {
        const top = elementOf(p.FPDF_StructTree_GetChildAtIndex(tree, at), 1);
        if (top) elements.push(top);
      }
      return { elements, cut };
    } finally {
      p.FPDF_StructTree_Close(tree);
    }
  });
}

/**
 * Reads the marked content of a page's characters: for the character at an index, its id, `PageText.ARTIFACT`, or
 * `PageText.UNMARKED` for the reader's own and for content drawn in none.
 */
export function markedContent(file: ReaderFile, text: number): (at: number) => number {
  const { p } = file;
  const known = new Map<number, number>();
  // The reader writes a name only where the buffer holds all of it, and says how long it is.
  const bytes = ARTIFACT.length * 2 + 2;
  const isArtifact = (mark: number): boolean => {
    const size = file.alloc(4);
    const buffer = file.alloc(bytes);
    const named =
      p.FPDFPageObjMark_GetName(mark, buffer, bytes, size) &&
      file.runtime.getValue(size, 'i32') === bytes &&
      file.runtime.UTF16ToString(buffer) === ARTIFACT;
    file.free(buffer);
    file.free(size);
    return named;
  };
  const of = (object: number): number => {
    const id = p.FPDFPageObj_GetMarkedContentID(object);
    if (id >= 0) return id;
    const marks = Math.max(p.FPDFPageObj_CountMarks(object), 0);
    for (let at = 0; at < marks; at += 1) {
      if (isArtifact(p.FPDFPageObj_GetMark(object, at))) return PageText.ARTIFACT;
    }
    return PageText.UNMARKED;
  };
  return (at) => {
    const object = p.FPDFText_GetTextObject(text, at);
    if (!object) return PageText.UNMARKED;
    let id = known.get(object);
    if (id === undefined) {
      id = of(object);
      known.set(object, id);
    }
    return id;
  };
}
