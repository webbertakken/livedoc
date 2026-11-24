// A drawing's picture in a file (docs/specs/034-text-documents/objects.md "In the file"): the picture names its drawing
// tab (`drawing`); a file read keeps the name only for the text document's own drawing tabs; a download draws each
// drawing afresh into the file, as Save and close places it (its width kept, its height by the drawing's shape, its
// crop dropped). Pure: the document in, a new one out, untouched where nothing changed.
import { mediaKeyOf, pictureHeader } from '@livedoc/office-packages';
import type { Block, Inline } from './blocks';
import { DocumentTabs } from './document-tabs';
import { HEADER_FOOTER_KINDS, HEADER_FOOTER_SLOTS, type SectionHeaders } from './headers';
import { Pictures, type DocumentMedia, type Picture } from './pictures';
import type { TextDocument } from './text-document';

type Change = (picture: Picture) => Picture;

/** A height to the hundredth of a point. */
const HEIGHT_PRECISION = 100;

function mapInlines(inlines: readonly Inline[], change: Change): readonly Inline[] {
  let changed = false;
  const out = inlines.map((inline) => {
    const next =
      inline.type === 'picture'
        ? change(inline)
        : inline.type === 'note'
          ? mapNote(inline, change)
          : inline;
    if (next !== inline) changed = true;
    return next;
  });
  return changed ? out : inlines;
}

function mapNote(note: Extract<Inline, { type: 'note' }>, change: Change) {
  const blocks = mapBlocks(note.blocks, change);
  return blocks === note.blocks ? note : { ...note, blocks };
}

function mapHeaders(headers: SectionHeaders | undefined, change: Change) {
  if (!headers) return headers;
  let changed = false;
  const out: Record<string, unknown> = { ...headers };
  for (const kind of HEADER_FOOTER_KINDS) {
    const set = headers[kind];
    if (!set) continue;
    const slots: Record<string, unknown> = { ...set };
    for (const slot of HEADER_FOOTER_SLOTS) {
      const story = set[slot];
      if (!story) continue;
      const blocks = mapBlocks(story.blocks, change);
      if (blocks === story.blocks) continue;
      slots[slot] = { ...story, blocks };
      changed = true;
    }
    out[kind] = slots;
  }
  return changed ? (out as SectionHeaders) : headers;
}

function mapBlocks(blocks: readonly Block[], change: Change): readonly Block[] {
  let changed = false;
  const out = blocks.map((block): Block => {
    let next: Block = block;
    if (block.type === 'paragraph') {
      const inlines = mapInlines(block.inlines, change);
      if (inlines !== block.inlines) next = { ...block, inlines };
    } else if (block.type === 'table') {
      let rowsChanged = false;
      const rows = block.rows.map((row) => {
        let cellsChanged = false;
        const cells = row.cells.map((cell) => {
          const cellBlocks = mapBlocks(cell.blocks, change);
          if (cellBlocks === cell.blocks) return cell;
          cellsChanged = true;
          return { ...cell, blocks: cellBlocks };
        });
        if (!cellsChanged) return row;
        rowsChanged = true;
        return { ...row, cells };
      });
      if (rowsChanged) next = { ...block, rows };
    } else if (block.type === 'section') {
      const headers = mapHeaders(block.headers, change);
      if (headers !== block.headers) next = { ...block, headers };
    }
    if (next !== block) changed = true;
    return next;
  });
  return changed ? out : blocks;
}

/** Every picture of the document through `change`: each tab's body, cells, notes and every header and footer. */
function mapPictures(document: TextDocument, change: Change): TextDocument {
  const mapped = DocumentTabs.mapBodies(document, (body) => mapBlocks(body, change));
  const headers = mapHeaders(document.section.headers, change);
  const changedBody =
    mapped.body !== document.body ||
    (mapped.tabs?.more ?? []).some((t, i) => t.body !== document.tabs?.more[i]?.body);
  if (!changedBody && headers === document.section.headers) return document;
  return headers === document.section.headers
    ? mapped
    : { ...mapped, section: { ...mapped.section, headers } };
}

/** The picture without its drawing's name. */
function plain(picture: Picture): Picture {
  const { drawing: _dropped, ...rest } = picture;
  return rest;
}

export const DrawingPictures = {
  /** The document with each picture's drawing name kept only where `own` says it is the text document's own. */
  keepOwn: (document: TextDocument, own: (drawingTabId: string) => boolean): TextDocument =>
    mapPictures(document, (p) =>
      p.drawing === undefined ? p : p.drawing !== '' && own(p.drawing) ? p : plain(p),
    ),

  /** How many pictures name a drawing whose name `own` refuses: what a read drops. */
  foreignNames: (document: TextDocument, own: (drawingTabId: string) => boolean): number =>
    Pictures.ofDocument(document).filter(
      (p) => p.drawing !== undefined && (p.drawing === '' || !own(p.drawing)),
    ).length,

  /**
   * The document with each picture naming a drawing in `drawn` showing those PNG bytes: new media by their SHA-256,
   * its width kept, its height by the PNG's shape, its crop dropped. Bytes that are no PNG of some size are skipped.
   */
  redrawn: async (
    document: TextDocument,
    drawn: ReadonlyMap<string, Uint8Array>,
  ): Promise<TextDocument> => {
    const fresh = new Map<string, { key: string; ratio: number; bytes: Uint8Array }>();
    for (const [id, bytes] of drawn) {
      const header = pictureHeader(bytes);
      if (header?.mediaType !== 'image/png' || header.width <= 0 || header.height <= 0) continue;
      fresh.set(id, { key: await mediaKeyOf(bytes), ratio: header.height / header.width, bytes });
    }
    if (fresh.size === 0) return document;
    const media: Record<string, DocumentMedia[string]> = { ...document.media };
    const out = mapPictures(document, (p) => {
      const made = p.drawing === undefined ? undefined : fresh.get(p.drawing);
      if (!made) return p;
      media[made.key] = { mediaType: 'image/png', bytes: made.bytes };
      const { crop: _dropped, ...rest } = p;
      const height = Math.round(p.width * made.ratio * HEIGHT_PRECISION) / HEIGHT_PRECISION;
      return { ...rest, media: made.key, height };
    });
    return out === document ? document : { ...out, media };
  },
} as const;
