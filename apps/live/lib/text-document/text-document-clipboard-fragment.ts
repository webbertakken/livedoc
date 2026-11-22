// LiveDoc's model fragment on the clipboard (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"): the
// copied paragraphs and runs exactly, with the styles and lists they name, carried in the copied HTML so it travels
// wherever the HTML does. Pasted into the tab it came from it is placed as copied; into another, its styles and lists
// are placed in that document's terms, and content kept from the other file stays behind.
import type { Slice } from 'prosemirror-model';
import {
  canonical,
  FOOTNOTE,
  KEPT_BLOCK,
  KEPT_INLINE,
  ListDefinition,
  PICTURE,
  RUN_KEPT_MARK,
  SECTION_BREAK,
  TABLE,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW,
  Styles,
  TEXT_PROPERTY_MARK_OF,
  TEXT_STYLE_MARK,
  type ListPlace,
  type ParagraphProps,
  type PictureMedia,
  type Style,
  type StyleDefaults,
  type TextDocumentFormat,
  type TextProps,
} from '@livedoc/text-documents';
import { base64OfBytes, bytesOfBase64 } from '@livedoc/text-documents/base64';
import { isMappedPictureType, pictureHeader } from '@livedoc/office-packages';
import type { Lists } from './text-document-lists';

const TABLE_NODES: ReadonlySet<string> = new Set([TABLE, TABLE_ROW, TABLE_CELL, TABLE_HEADER]);

/** The HTML attribute the fragment travels in, on the copied HTML's first element. */
export const FRAGMENT_ATTRIBUTE = 'data-livedoc-fragment';
export const FRAGMENT_VERSION = 1;
/** The longest fragment read (default): room for every character the document may hold, each with its formatting. */
export const FRAGMENT_MAX_CHARS = 50_000_000;

export type MarkJson = { type: string; attrs?: Record<string, unknown> };
export type NodeJson = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NodeJson[];
  marks?: MarkJson[];
  text?: string;
};
export type SliceJson = { content?: NodeJson[]; openStart?: number; openEnd?: number };

/** Where a fragment was copied, or is pasted. */
export type FragmentPlace = {
  readonly documentId: string;
  readonly tabId: string;
  readonly format: TextDocumentFormat;
};

/** The document a fragment is copied from or pasted into: its place, styles, defaults and lists. */
export type FragmentContext = FragmentPlace & {
  readonly styles: readonly Style[];
  readonly defaults: StyleDefaults;
  readonly lists: Lists;
  /** A footnote's writing by its story, as the document holds it (page-layout.md "Footnotes"). */
  readonly readNote?: (story: string) => NodeJson[] | null;
  /** A picture's media by its key, as the document holds it (objects.md "In the editor"). */
  readonly readMedia?: (key: string) => PictureMedia | undefined;
};

/** A picture's media as the fragment carries it: its media type and its bytes in base64. */
export type FragmentMedia = { readonly mediaType: string; readonly data: string };

export type ClipboardFragment = {
  readonly v: typeof FRAGMENT_VERSION;
  readonly source: FragmentPlace;
  readonly slice: SliceJson;
  readonly styles: readonly Style[];
  readonly defaults: StyleDefaults;
  readonly lists: Lists;
  /** The writing of each footnote whose mark is copied, by its story. */
  readonly notes?: Readonly<Record<string, NodeJson[]>>;
  /** The media of each copied picture, by its key. */
  readonly media?: Readonly<Record<string, FragmentMedia>>;
};

export type FragmentRead =
  | { readonly ok: true; readonly fragment: ClipboardFragment }
  | { readonly ok: false; readonly reason: 'too-long' | 'not-json' | 'shape' };

/** The media a fragment brings, each only when its bytes are a whole picture of the type it names and the model maps. */
function broughtMedia(
  media: Readonly<Record<string, FragmentMedia>>,
): Record<string, PictureMedia> {
  const out: Record<string, PictureMedia> = {};
  for (const [key, m] of Object.entries(media)) {
    const bytes = bytesOfBase64(m.data);
    const type = bytes && pictureHeader(bytes)?.mediaType;
    if (bytes && type === m.mediaType && isMappedPictureType(type))
      out[key] = { mediaType: type, bytes };
  }
  return out;
}

/** The fragment placed in a document: its slice, the lists it brings (by their new ids), and kept items left out. */
export type PlacedFragment = {
  readonly slice: SliceJson;
  readonly lists: Lists;
  readonly left: number;
  /** The copied footnotes' writing, placed as the slice is. */
  readonly notes: Readonly<Record<string, NodeJson[]>>;
  /** The media its pictures bring into another document, by key: whole pictures of a type the model maps. */
  readonly media: Readonly<Record<string, PictureMedia>>;
};

function walk(nodes: readonly NodeJson[] | undefined, visit: (node: NodeJson) => void): void {
  for (const node of nodes ?? []) {
    visit(node);
    walk(node.content, visit);
  }
}

const attrsOf = (node: { attrs?: Record<string, unknown> }) => node.attrs ?? {};
const placeOf = (node: NodeJson) => (attrsOf(node).list as ListPlace | null | undefined) ?? null;

/** The styles these ids name, with every parent they inherit from. */
function stylesWithParents(styles: readonly Style[], ids: Iterable<string>): Style[] {
  const out = new Map<string, Style>();
  for (const first of ids) {
    let style = Styles.byId(styles, first);
    while (style && !out.has(style.id)) {
      out.set(style.id, style);
      style = Styles.byId(styles, style.parent);
    }
  }
  return [...out.values()];
}

/** The fragment of a copied slice, from the document it is copied in. */
export function makeFragment(slice: Slice, context: FragmentContext): ClipboardFragment {
  const json = (slice.toJSON() as SliceJson | null) ?? {};
  const styleIds = new Set<string>();
  const listIds = new Set<string>();
  const notes: Record<string, NodeJson[]> = {};
  walk(json.content, (node) => {
    const story = attrsOf(node).story;
    if (node.type === FOOTNOTE && typeof story === 'string' && !Object.hasOwn(notes, story))
      notes[story] = context.readNote?.(story) ?? [];
  });
  const all = [...(json.content ?? []), ...Object.values(notes).flat()];
  const media: Record<string, FragmentMedia> = {};
  walk(all, (node) => {
    const key = attrsOf(node).media;
    if (node.type !== PICTURE || typeof key !== 'string' || Object.hasOwn(media, key)) return;
    const held = context.readMedia?.(key);
    if (held) media[key] = { mediaType: held.mediaType, data: base64OfBytes(held.bytes) };
  });
  walk(all, (node) => {
    const style = attrsOf(node).style;
    if (node.type === 'paragraph' && typeof style === 'string') styleIds.add(style);
    const place = placeOf(node);
    if (place) listIds.add(place.id);
    for (const mark of node.marks ?? [])
      if (mark.type === TEXT_STYLE_MARK && typeof attrsOf(mark).id === 'string')
        styleIds.add(attrsOf(mark).id as string);
  });
  const { documentId, tabId, format } = context;
  return {
    v: FRAGMENT_VERSION,
    source: { documentId, tabId, format },
    slice: json,
    styles: stylesWithParents(context.styles, styleIds),
    defaults: context.defaults,
    lists: Object.fromEntries(
      [...listIds].filter((id) => context.lists[id]).map((id) => [id, context.lists[id]!]),
    ),
    ...(Object.keys(notes).length > 0 ? { notes } : {}),
    ...(Object.keys(media).length > 0 ? { media } : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStyle = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  (value.family === 'paragraph' || value.family === 'text') &&
  isRecord(value.paragraph) &&
  isRecord(value.text);

function isFragment(value: unknown): value is ClipboardFragment {
  if (!isRecord(value) || value.v !== FRAGMENT_VERSION) return false;
  const { source, slice, styles, defaults, lists, notes, media } = value;
  return (
    isRecord(source) &&
    typeof source.documentId === 'string' &&
    typeof source.tabId === 'string' &&
    (source.format === 'odf' || source.format === 'ooxml') &&
    isRecord(slice) &&
    (slice.content === undefined || Array.isArray(slice.content)) &&
    Array.isArray(styles) &&
    styles.every(isStyle) &&
    isRecord(defaults) &&
    isRecord(defaults.paragraph) &&
    isRecord(defaults.text) &&
    isRecord(lists) &&
    Object.values(lists).every((list) => isRecord(list) && Array.isArray(list.levels)) &&
    (notes === undefined || (isRecord(notes) && Object.values(notes).every(Array.isArray))) &&
    (media === undefined ||
      (isRecord(media) &&
        Object.values(media).every(
          (m) => isRecord(m) && typeof m.mediaType === 'string' && typeof m.data === 'string',
        )))
  );
}

/** A fragment from the attribute's text; refused when it is not one LiveDoc wrote (its size or shape wrong). */
export function readFragment(text: string): FragmentRead {
  if (text.length > FRAGMENT_MAX_CHARS) return { ok: false, reason: 'too-long' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  return isFragment(value) ? { ok: true, fragment: value } : { ok: false, reason: 'shape' };
}

/** What `resolved` sets that `base` does not, or sets otherwise. */
function difference<T extends object>(resolved: T, base: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resolved))
    if (
      value !== undefined &&
      canonical(value) !== canonical((base as Record<string, unknown>)[key])
    )
      out[key] = value;
  return out as Partial<T>;
}

type PlacedStyle = { id: string | null; paragraph: ParagraphProps; text: TextProps };

/** How the fragment's styles read in the target: its own style of the role, the same style, or Normal plus the look. */
function styleMapper(fragment: ClipboardFragment, target: FragmentContext) {
  const placed = new Map<string, PlacedStyle>();
  const normal = Styles.idOfRole(target.styles, 'normal');
  return (id: string): PlacedStyle => {
    const known = placed.get(id);
    if (known) return known;
    const source = Styles.byId(fragment.styles, id);
    const same = Styles.byId(target.styles, id);
    const role = source?.role ? Styles.idOfRole(target.styles, source.role) : undefined;
    let result: PlacedStyle;
    if (role) result = { id: role, paragraph: {}, text: {} };
    else if (same && source && same.name === source.name && same.family === source.family)
      result = { id, paragraph: {}, text: {} };
    else if (source?.family === 'text')
      result = {
        id: null,
        paragraph: {},
        text: Styles.textPropsOf(fragment.styles, { paragraph: {}, text: {} }, undefined, id),
      };
    else
      result = {
        id: normal ?? null,
        paragraph: difference(
          Styles.paragraphPropsOf(fragment.styles, fragment.defaults, id),
          Styles.paragraphPropsOf(target.styles, target.defaults, normal),
        ),
        text: difference(
          Styles.textPropsOf(fragment.styles, fragment.defaults, id),
          Styles.textPropsOf(target.styles, target.defaults, normal),
        ),
      };
    placed.set(id, result);
    return result;
  };
}

const MARK_OF = TEXT_PROPERTY_MARK_OF as Record<string, string>;

/** Text formatting added as marks wherever the text has none of that kind. */
function withTextProps(marks: MarkJson[], props: TextProps): MarkJson[] {
  const out = [...marks];
  for (const [key, value] of Object.entries(props)) {
    const type = MARK_OF[key];
    if (value === undefined || !type || out.some((m) => m.type === type)) continue;
    out.push({ type, attrs: { value } });
  }
  return out;
}

/** The fragment placed in the target document. */
export function placeFragment(
  fragment: ClipboardFragment,
  target: FragmentContext & { readonly listIds?: Iterable<string> },
): PlacedFragment {
  const { source } = fragment;
  if (source.documentId === target.documentId && source.tabId === target.tabId)
    return { slice: fragment.slice, lists: {}, left: 0, notes: fragment.notes ?? {}, media: {} };
  const media = broughtMedia(fragment.media ?? {});
  const style = styleMapper(fragment, target);
  const taken = new Set([...Object.keys(target.lists), ...(target.listIds ?? [])]);
  const listIds = new Map<string, string>();
  const lists: Record<string, ListDefinition> = {};
  const listOf = (id: string): string => {
    const known = listIds.get(id);
    if (known) return known;
    const next = ListDefinition.newId(taken);
    taken.add(next);
    listIds.set(id, next);
    const { kept: _, ...definition } = fragment.lists[id] ?? ListDefinition.of('bullet');
    lists[next] = definition;
    return next;
  };
  const ooxml = target.format === 'ooxml';
  let left = 0;

  const text = (node: NodeJson, extra: TextProps): NodeJson => {
    let marks = (node.marks ?? []).filter((m) => m.type !== RUN_KEPT_MARK);
    let own: TextProps = {};
    const textStyle = marks.find((m) => m.type === TEXT_STYLE_MARK);
    if (textStyle) {
      const mapped = style(String(attrsOf(textStyle).id));
      if (mapped.id === null) {
        marks = marks.filter((m) => m !== textStyle);
        own = mapped.text;
      }
    }
    return { ...node, marks: withTextProps(marks, { ...extra, ...own }) };
  };

  const placeNodes = (nodes: readonly NodeJson[] | undefined): NodeJson[] =>
    (nodes ?? []).flatMap((node): NodeJson[] => {
      if (node.type === KEPT_INLINE || node.type === KEPT_BLOCK) {
        left += 1;
        return [];
      }
      const attrs = attrsOf(node);
      // A picture comes with its media, else it is left out (objects.md "In the editor").
      if (node.type === PICTURE) {
        if (typeof attrs.media === 'string' && Object.hasOwn(media, attrs.media))
          return [{ ...node, attrs: { ...attrs, kept: null } }];
        left += 1;
        return [];
      }
      if (node.type === SECTION_BREAK)
        return [{ ...node, attrs: { ...attrs, kept: null, region: null } }];
      // A table's rows and cells placed whole, what the other file kept left behind; a cell left empty holds a paragraph.
      if (TABLE_NODES.has(node.type)) {
        const placed = placeNodes(node.content);
        const content =
          placed.length > 0 || (node.type !== TABLE_CELL && node.type !== TABLE_HEADER)
            ? placed
            : [{ type: 'paragraph', attrs: { style: null } }];
        return [{ ...node, attrs: { ...attrs, kept: null, tag: null }, content }];
      }
      if (node.type !== 'paragraph') return [node];
      const mapped = typeof attrs.style === 'string' ? style(attrs.style) : null;
      const props = { ...mapped?.paragraph, ...((attrs.props as ParagraphProps | null) ?? {}) };
      const place = placeOf(node);
      const list = place
        ? (({ unnumbered, ...rest }: ListPlace) => ({
            ...rest,
            ...(unnumbered && !ooxml ? { unnumbered } : {}),
            id: listOf(place.id),
          }))(place)
        : null;
      // OOXML has no text formatting of a paragraph's own: it moves onto the runs, as conversion does.
      const paragraphText = (attrs.text as TextProps | null) ?? null;
      const extra = { ...mapped?.text, ...(ooxml ? paragraphText : null) };
      return [
        {
          ...node,
          attrs: {
            ...attrs,
            style: mapped ? mapped.id : (attrs.style ?? null),
            props: Object.keys(props).length > 0 ? props : null,
            list,
            text: ooxml ? null : paragraphText,
            kept: null,
          },
          content: (node.content ?? []).flatMap((child) =>
            child.type === 'text' ? [text(child, extra)] : placeNodes([child]),
          ),
        },
      ];
    });

  const content = placeNodes(fragment.slice.content);
  const notes = Object.fromEntries(
    Object.entries(fragment.notes ?? {}).map(([story, blocks]) => [story, placeNodes(blocks)]),
  );
  return { slice: { ...fragment.slice, content }, lists, left, notes, media };
}
