// Headers and footers in the live state (docs/specs/034-text-documents/live-editing-and-storage.md "The layout"): each
// one a root XML fragment `story:<id>` in the body's layout, a section's `headers` naming them by id as a whole value.
// A header two sections share (as a file read them) is one fragment both name. A footnote's writing is a fragment too,
// its mark in the body naming it (page-layout.md "Footnotes").
import * as Y from 'yjs';
import type { Block, Note } from '../model/blocks';
import {
  HEADER_FOOTER_KINDS,
  HEADER_FOOTER_SLOTS,
  type HeaderFooter,
  type HeaderFooterSlot,
  type SectionHeaders,
  type SectionHeadersOf,
} from '../model/headers';
import { tabFragment } from './live-root';
import { liveTabFragments, liveTabIds } from './live-tabs';
import { FIRST_DOCUMENT_TAB_ID } from '../model/document-tabs';
import { paragraphElementsOf } from './live-tables';
import { DOCUMENT_MAP, FOOTNOTE, SECTION_BREAK } from './live-names';

/** A root fragment holding a header's or footer's blocks is named this, then its id. */
export const STORY_PREFIX = 'story:';

/** A header or footer as a section holds it in the live state: the fragment's id, and the part it came from. */
export type LiveStory = { readonly story: string; readonly part?: string };

/** A section's headers and footers as the live state holds them. */
export type LiveHeaders = SectionHeadersOf<LiveStory>;

export const storyFragment = (doc: Y.Doc, id: string): Y.XmlFragment =>
  doc.getXmlFragment(`${STORY_PREFIX}${id}`);

/** The first section's headers as held, in the document map. */
export const liveFirstHeaders = (doc: Y.Doc): LiveHeaders | undefined =>
  (doc.getMap<unknown>(DOCUMENT_MAP).get('section') as { headers?: LiveHeaders } | undefined)
    ?.headers;

/**
 * Each section's headers as held in a document tab: the first section's, then each of the tab's section breaks', in its
 * body's order (text-document.md "What a document tab is": each tab starts in the first section).
 */
export function liveSectionHeaders(
  doc: Y.Doc,
  tab: string = FIRST_DOCUMENT_TAB_ID,
): (LiveHeaders | undefined)[] {
  const later = tabFragment(doc, tab)
    .toArray()
    .flatMap((node) =>
      node instanceof Y.XmlElement && node.nodeName === SECTION_BREAK
        ? [node.getAttribute('headers') as unknown as LiveHeaders | undefined]
        : [],
    );
  return [liveFirstHeaders(doc), ...later];
}

/** The notes' fragments every tab's marks name, in the marks' order, tab by tab. */
export function liveNoteIds(doc: Y.Doc): string[] {
  return liveTabFragments(doc).flatMap(noteIdsIn);
}

/** The notes' fragments one body's marks name, in the marks' order. */
function noteIdsIn(body: Y.XmlFragment): string[] {
  return paragraphElementsOf(body).flatMap((node) =>
    node.toArray().flatMap((child) => {
      const story =
        child instanceof Y.XmlElement && child.nodeName === FOOTNOTE
          ? child.getAttribute('story')
          : undefined;
      return typeof story === 'string' ? [story] : [];
    }),
  );
}

/**
 * Every story, each once: those a section names, section by section, headers before footers, default, first, even;
 * then the notes', in their marks' order.
 */
export function liveStoryIds(doc: Y.Doc): string[] {
  const ids = new Set<string>();
  for (const headers of liveTabIds(doc).flatMap((tab) => liveSectionHeaders(doc, tab)))
    for (const kind of HEADER_FOOTER_KINDS)
      for (const slot of HEADER_FOOTER_SLOTS) {
        const story = headers?.[kind]?.[slot]?.story;
        if (typeof story === 'string') ids.add(story);
      }
  for (const id of liveNoteIds(doc)) ids.add(id);
  return [...ids];
}

/** Writes stories into their fragments, each once, giving each section's headers as ids. */
export class StoryWriter {
  readonly #ids = new Map<HeaderFooter, string>();
  #next = 1;
  readonly #doc: Y.Doc;
  readonly #node: (block: Block) => Y.XmlElement;

  constructor(doc: Y.Doc, node: (block: Block) => Y.XmlElement) {
    this.#doc = doc;
    this.#node = node;
  }

  /** The section's headers with each header's blocks written to a fragment of its own. */
  headers(headers: SectionHeaders | undefined): LiveHeaders | undefined {
    if (!headers) return undefined;
    const kind = (set: NonNullable<SectionHeaders['header']>) => {
      const out: Partial<Record<HeaderFooterSlot, LiveStory>> = {};
      for (const slot of HEADER_FOOTER_SLOTS) {
        const h = set[slot];
        if (h) out[slot] = { story: this.#write(h), ...(h.part ? { part: h.part } : {}) };
      }
      return out;
    };
    const { header, footer, ...switches } = headers;
    return {
      ...switches,
      ...(header ? { header: kind(header) } : {}),
      ...(footer ? { footer: kind(footer) } : {}),
    };
  }

  /** A note's blocks written to a fragment of its own: its id. */
  note(note: Note): string {
    return this.#fragment(note.blocks);
  }

  #write(h: HeaderFooter): string {
    const known = this.#ids.get(h);
    if (known) return known;
    const id = this.#fragment(h.blocks);
    this.#ids.set(h, id);
    return id;
  }

  #fragment(blocks: readonly Block[]): string {
    const id = String(this.#next++);
    const fragment = storyFragment(this.#doc, id);
    fragment.delete(0, fragment.length);
    fragment.insert(0, blocks.map(this.#node));
    return id;
  }
}

/** A section's headers read from their fragments, each fragment read once (shared ones stay one header). */
export class StoryReader {
  readonly #read = new Map<string, HeaderFooter>();
  readonly #doc: Y.Doc;
  readonly #block: (node: Y.XmlElement) => Block | null;

  constructor(doc: Y.Doc, block: (node: Y.XmlElement) => Block | null) {
    this.#doc = doc;
    this.#block = block;
  }

  /** A story's blocks from its fragment: a note's, or a header's. */
  note(story: string): Block[] {
    return storyFragment(this.#doc, story)
      .toArray()
      .flatMap((node) => {
        const block = node instanceof Y.XmlElement ? this.#block(node) : null;
        return block ? [block] : [];
      });
  }

  headers(live: LiveHeaders | undefined): SectionHeaders | undefined {
    if (!live) return undefined;
    const kind = (set: NonNullable<LiveHeaders['header']>) => {
      const out: Partial<Record<HeaderFooterSlot, HeaderFooter>> = {};
      for (const slot of HEADER_FOOTER_SLOTS) {
        const s = set[slot];
        if (s && typeof s.story === 'string') out[slot] = this.#story(s);
      }
      return out;
    };
    const { header, footer, ...switches } = live;
    return {
      ...switches,
      ...(header ? { header: kind(header) } : {}),
      ...(footer ? { footer: kind(footer) } : {}),
    };
  }

  #story({ story, part }: LiveStory): HeaderFooter {
    const known = this.#read.get(story);
    if (known) return known;
    const blocks = this.note(story);
    const h: HeaderFooter = { blocks, ...(part ? { part } : {}) };
    this.#read.set(story, h);
    return h;
  }
}

/** A body or a story whose writing a document tab shows: its fragment, its tab, and its story's id when a story. */
export type LiveWriting = {
  readonly tab: string;
  readonly story?: string;
  readonly fragment: Y.XmlFragment;
};

/**
 * Every writing, tab by tab: the tab's body, then each story it shows that no earlier tab did, its sections' headers
 * and footers (default, first, even) before the notes its body's marks name (review.md "How a suggestion is kept").
 * A fragment nothing names is no story.
 */
export function liveWritings(doc: Y.Doc): LiveWriting[] {
  const seen = new Set<string>();
  const out: LiveWriting[] = [];
  const story = (tab: string, id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ tab, story: id, fragment: storyFragment(doc, id) });
  };
  for (const tab of liveTabIds(doc)) {
    out.push({ tab, fragment: tabFragment(doc, tab) });
    for (const headers of liveSectionHeaders(doc, tab))
      for (const kind of HEADER_FOOTER_KINDS)
        for (const slot of HEADER_FOOTER_SLOTS) {
          const id = headers?.[kind]?.[slot]?.story;
          if (typeof id === 'string') story(tab, id);
        }
    for (const id of noteIdsIn(tabFragment(doc, tab))) story(tab, id);
  }
  return out;
}
