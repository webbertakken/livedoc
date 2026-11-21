// Headers and footers in the live state (docs/specs/034-text-documents/live-editing-and-storage.md "The layout"): each
// one a root XML fragment `story:<id>` in the body's layout, a section's `headers` naming them by id as a whole value.
// A header two sections share (as a file read them) is one fragment both name.
import * as Y from 'yjs';
import type { Block } from '../model/blocks';
import {
  HEADER_FOOTER_KINDS,
  HEADER_FOOTER_SLOTS,
  type HeaderFooter,
  type HeaderFooterSlot,
  type SectionHeaders,
  type SectionHeadersOf,
} from '../model/headers';
import { BODY_FRAGMENT } from './live-root';
import { DOCUMENT_MAP, SECTION_BREAK } from './live-names';

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

/** Each section's headers as held: the first section's, then each section break's, in the body's order. */
export function liveSectionHeaders(doc: Y.Doc): (LiveHeaders | undefined)[] {
  const later = doc
    .getXmlFragment(BODY_FRAGMENT)
    .toArray()
    .flatMap((node) =>
      node instanceof Y.XmlElement && node.nodeName === SECTION_BREAK
        ? [node.getAttribute('headers') as unknown as LiveHeaders | undefined]
        : [],
    );
  return [liveFirstHeaders(doc), ...later];
}

/** Every story a section names, each once: section by section, headers before footers, default, first, even. */
export function liveStoryIds(doc: Y.Doc): string[] {
  const ids = new Set<string>();
  for (const headers of liveSectionHeaders(doc))
    for (const kind of HEADER_FOOTER_KINDS)
      for (const slot of HEADER_FOOTER_SLOTS) {
        const story = headers?.[kind]?.[slot]?.story;
        if (typeof story === 'string') ids.add(story);
      }
  return [...ids];
}

/** Writes stories into their fragments, each once, giving each section's headers as ids. */
export class StoryWriter {
  readonly #ids = new Map<HeaderFooter, string>();
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

  #write(h: HeaderFooter): string {
    const known = this.#ids.get(h);
    if (known) return known;
    const id = String(this.#ids.size + 1);
    this.#ids.set(h, id);
    const fragment = storyFragment(this.#doc, id);
    fragment.delete(0, fragment.length);
    fragment.insert(0, h.blocks.map(this.#node));
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
    const blocks = storyFragment(this.#doc, story)
      .toArray()
      .flatMap((node) => {
        const block = node instanceof Y.XmlElement ? this.#block(node) : null;
        return block ? [block] : [];
      });
    const h: HeaderFooter = { blocks, ...(part ? { part } : {}) };
    this.#read.set(story, h);
    return h;
  }
}
