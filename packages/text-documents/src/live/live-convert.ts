// A conversion applied to the live state (docs/specs/034-text-documents/standard-mapping.md "Conversion"): the
// document is read, converted, and written into a scratch state; the live state is then made to read as the scratch
// by the least change, in one transaction under the caller's origin, so one undo takes it all back. Each header,
// footer and note keeps its story id where the converted document still has a story in its place, so what a person is
// editing stays bound and only what the conversion changed is written. Comment threads are never touched.
import * as Y from 'yjs';
import { convertTextDocument, type ConversionLoss } from '../convert';
import { HEADER_FOOTER_KINDS, HEADER_FOOTER_SLOTS } from '../model/headers';
import type { TextDocumentFormat } from '../model/text-document';
import { readLiveDocument } from './live-read';
import {
  DOCUMENT_MAP,
  FOOTNOTE,
  LISTS_MAP,
  MEDIA_MAP,
  SECTION_BREAK,
  SOURCE_MAP,
  STYLES_MAP,
  TABS_MAP,
} from './live-names';
import { tabFragment } from './live-root';
import {
  liveSectionHeaders,
  noteIdsIn,
  STORY_PREFIX,
  storyFragment,
  type LiveHeaders,
} from './live-stories';
import { liveTabIds } from './live-tabs';
import { writeLiveDocument } from './live-write';
import { canonical, syncWriting } from './writing-sync';

/** The root maps a conversion makes read as the converted document's; the threads map is never among them. */
const CONVERTED_MAPS = [DOCUMENT_MAP, STYLES_MAP, LISTS_MAP, SOURCE_MAP, MEDIA_MAP, TABS_MAP];

/** Each story by its place: a section's header or footer slot in a tab, or a tab's nth note; the first place wins. */
function storyPlaces(doc: Y.Doc): Map<string, string> {
  const places = new Map<string, string>();
  const seen = new Set<string>();
  const add = (place: string, id: unknown) => {
    if (typeof id !== 'string' || seen.has(id)) return;
    seen.add(id);
    places.set(place, id);
  };
  for (const tab of liveTabIds(doc)) {
    liveSectionHeaders(doc, tab).forEach((headers, section) => {
      for (const kind of HEADER_FOOTER_KINDS)
        for (const slot of HEADER_FOOTER_SLOTS)
          add(`${tab}/${section}/${kind}/${slot}`, headers?.[kind]?.[slot]?.story);
    });
    noteIdsIn(tabFragment(doc, tab)).forEach((id, n) => add(`${tab}/note/${n}`, id));
  }
  return places;
}

/** The scratch's story ids to write under: the live story in the same place, else a new id the live state lacks. */
function storyIds(live: Y.Doc, scratch: Y.Doc): Map<string, string> {
  const livePlaces = storyPlaces(live);
  // Every story fragment the live state holds, named or not: a new id never writes into one.
  const taken = new Set(
    [...live.share.keys()].flatMap((name) =>
      name.startsWith(STORY_PREFIX) ? [name.slice(STORY_PREFIX.length)] : [],
    ),
  );
  const ids = new Map<string, string>();
  for (const [place, id] of storyPlaces(scratch)) {
    const own = livePlaces.get(place);
    if (own !== undefined && !ids.has(id)) ids.set(id, own);
  }
  const used = new Set(ids.values());
  for (const id of storyPlaces(scratch).values()) {
    if (ids.has(id)) continue;
    let fresh = `converted-${id}`;
    while (taken.has(fresh) || used.has(fresh)) fresh = `${fresh}-`;
    used.add(fresh);
    ids.set(id, fresh);
  }
  return ids;
}

/** A section's headers naming the stories by their live ids. */
function renamedHeaders(headers: LiveHeaders | undefined, ids: Map<string, string>) {
  if (!headers) return headers;
  const out: Record<string, unknown> = { ...headers };
  for (const kind of HEADER_FOOTER_KINDS) {
    const set = headers[kind];
    if (!set) continue;
    out[kind] = Object.fromEntries(
      Object.entries(set).map(([slot, story]) => [
        slot,
        story && { ...story, story: ids.get(story.story) ?? story.story },
      ]),
    );
  }
  return out as LiveHeaders;
}

/** Every element below a fragment or an element, depth first. */
function* elementsOf(parent: Y.XmlFragment | Y.XmlElement): Generator<Y.XmlElement> {
  for (const node of parent.toArray())
    if (node instanceof Y.XmlElement) {
      yield node;
      yield* elementsOf(node);
    }
}

/** The scratch's references to stories (sections' headers, notes' marks) renamed to the live ids. */
function renameStories(scratch: Y.Doc, ids: Map<string, string>): void {
  scratch.transact(() => {
    const meta = scratch.getMap<unknown>(DOCUMENT_MAP);
    const section = meta.get('section') as { headers?: LiveHeaders } | undefined;
    if (section?.headers)
      meta.set('section', { ...section, headers: renamedHeaders(section.headers, ids) });
    for (const tab of liveTabIds(scratch))
      for (const element of elementsOf(tabFragment(scratch, tab))) {
        if (element.nodeName === SECTION_BREAK) {
          const headers = element.getAttribute('headers') as unknown as LiveHeaders | undefined;
          if (headers)
            element.setAttribute('headers', renamedHeaders(headers, ids) as unknown as string);
        }
        if (element.nodeName === FOOTNOTE) {
          const story = element.getAttribute('story');
          if (typeof story === 'string' && ids.has(story))
            element.setAttribute('story', ids.get(story)!);
        }
      }
  });
}

/** Makes one root map read as another's, key by key: equal values kept, others set, keys gone deleted. */
function syncMap(source: Y.Map<unknown>, target: Y.Map<unknown>): void {
  for (const [key, value] of source.entries())
    if (canonical(target.get(key)) !== canonical(value)) target.set(key, value);
  for (const key of [...target.keys()]) if (!source.has(key)) target.delete(key);
}

/**
 * Makes the live state read as `scratch` by the least change, in one transaction under `origin`: each writing synced
 * (a story under the live id of its place, or a new one), each root map key by key, and a live story the scratch has
 * no place for emptied. The scratch's story references are renamed on the way: it is spent after.
 */
export function makeLiveReadAs(live: Y.Doc, scratch: Y.Doc, origin?: unknown): void {
  const ids = storyIds(live, scratch);
  // The scratch's writings, gathered under its own story ids before they are renamed.
  const writings = [
    ...liveTabIds(scratch).map((tab) => ({
      fragment: tabFragment(scratch, tab),
      target: () => tabFragment(live, tab),
    })),
    ...[...ids].map(([id, liveId]) => ({
      fragment: storyFragment(scratch, id),
      target: () => storyFragment(live, liveId),
    })),
  ];
  const kept = new Set(ids.values());
  const dropped = [...storyPlaces(live).values()].filter((id) => !kept.has(id));
  renameStories(scratch, ids);
  live.transact(() => {
    for (const { fragment, target } of writings) syncWriting(fragment, target());
    for (const id of dropped) {
      const fragment = storyFragment(live, id);
      fragment.delete(0, fragment.length);
    }
    for (const name of CONVERTED_MAPS) syncMap(scratch.getMap(name), live.getMap(name));
  }, origin);
}

/**
 * Converts the live state from `from` to `to` in one transaction under `origin`, and answers what the other format
 * could not hold. The state does not hold its format: the caller says which it is, and changes the tab's after.
 */
export function convertLive(
  live: Y.Doc,
  from: TextDocumentFormat,
  to: TextDocumentFormat,
  origin?: unknown,
): ConversionLoss[] {
  const { document, losses } = convertTextDocument(readLiveDocument(live, from), to);
  const scratch = new Y.Doc();
  try {
    writeLiveDocument(scratch, document);
    makeLiveReadAs(live, scratch, origin);
  } finally {
    scratch.destroy();
  }
  return losses;
}
