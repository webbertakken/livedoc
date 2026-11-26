// ODF's tracked changes as suggestions (docs/specs/034-text-documents/review.md "How a suggestion is kept", "In the
// files"; ODF 1.4 §5.5): `text:tracked-changes` lists each changed region (an insertion, a deletion or a format change
// with its change-info); the writing marks each as a range, `text:change-start` to `text:change-end`, the deleted text
// left in place, as LibreOffice writes them. A range open when a paragraph starts makes its break inserted or deleted
// (a join). The older point form, `text:change` with the deleted text in its region, reads too. A region of LiveDoc's
// carries its suggestion's id (`livedoc:suggestion`), a format's formatting before (`livedoc:before`) and whether it
// is a paragraph's (`livedoc:paragraph`), so LiveDoc's own files read back whole.
import {
  attributeOf,
  childElement,
  childElements,
  type XmlElement,
} from '@livedoc/office-packages';
import { Comments } from '../model/comments';
import type { ParagraphProps, TextProps } from '../model/props';
import {
  Suggestions,
  type FileFormatChange,
  type FileParagraphFormatChange,
  type FileSuggestionMark,
  type InlineSuggested,
  type ParagraphSuggested,
} from '../model/suggestions';
import { LIVEDOC_NS, NS } from './odf-names';

type Kind = 'insertion' | 'deletion' | 'format';

/** A changed region as read: its kind, mark, a format's formatting before, and the point form's deleted writing. */
export type OdfChange = {
  readonly kind: Kind;
  readonly mark: FileSuggestionMark;
  readonly paragraph: boolean;
  readonly before?: unknown;
  readonly deleted: readonly XmlElement[];
};

const KIND_OF: Record<string, Kind> = {
  insertion: 'insertion',
  deletion: 'deletion',
  'format-change': 'format',
};

/**
 * The regions `text:tracked-changes` lists, by their id; `unknown` hears each region of a kind the model does not hold
 * (LibreOffice's own `text:UnknownChange` for a paragraph's attributes), whose marks then read as nothing.
 */
export function readOdfChangedRegions(
  text: XmlElement | undefined,
  unknown: (name: string) => void = () => {},
): Map<string, OdfChange> {
  const regions = new Map<string, OdfChange>();
  const list = text && childElement(text, NS.text, 'tracked-changes');
  for (const region of list ? childElements(list) : []) {
    if (region.uri !== NS.text || region.local !== 'changed-region') continue;
    const id = attributeOf(region, NS.text, 'id') ?? attributeOf(region, NS.xml, 'id');
    const change = childElements(region).find((c) => c.uri === NS.text && KIND_OF[c.local]);
    if (id === undefined || !change) {
      unknown(childElements(region)[0]?.local ?? region.local);
      continue;
    }
    const info = childElement(change, NS.office, 'change-info');
    const said = (name: string) => {
      const e = info && childElement(info, NS.dc, name);
      return e ? e.children.filter((c) => typeof c === 'string').join('') : undefined;
    };
    const own = attributeOf(region, LIVEDOC_NS, 'suggestion');
    const at = Comments.timeOf(said('date'));
    const before = attributeOf(region, LIVEDOC_NS, 'before');
    regions.set(id, {
      kind: KIND_OF[change.local]!,
      mark: {
        id: own && own.length <= 64 ? own : `f.${id}`,
        ...(at === undefined ? {} : { at }),
        author: Suggestions.authorOf(said('creator')),
      },
      paragraph: attributeOf(region, LIVEDOC_NS, 'paragraph') === 'true',
      ...(before === undefined ? {} : { before: parsed(before) }),
      deleted: childElements(change).filter(
        (c) => !(c.uri === NS.office && c.local === 'change-info'),
      ),
    });
  }
  return regions;
}

const parsed = (json: string): unknown => {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The changes open where the writing is read: what each inline and paragraph read now is part of. */
export class OdfChangeTracker {
  readonly regions: ReadonlyMap<string, OdfChange>;
  readonly #open = new Map<string, OdfChange>();
  #paragraphFormat: OdfChange | undefined;

  constructor(regions: ReadonlyMap<string, OdfChange>) {
    this.regions = regions;
  }

  /** Whether the element is a change mark: a range's start or end, or the point form's deletion. */
  static isMark(e: XmlElement): boolean {
    return (
      e.uri === NS.text &&
      (e.local === 'change-start' || e.local === 'change-end' || e.local === 'change')
    );
  }

  /** Opens or closes a range at its mark; answers the point form's region for the reader to put its writing in. */
  mark(e: XmlElement): OdfChange | undefined {
    const id = attributeOf(e, NS.text, 'change-id');
    const region = id === undefined ? undefined : this.regions.get(id);
    if (!region || id === undefined) return undefined;
    if (e.local === 'change') return region.kind === 'deletion' ? region : undefined;
    if (e.local === 'change-end') {
      this.#open.delete(id);
      return undefined;
    }
    if (region.paragraph) this.#paragraphFormat = region;
    else this.#open.set(id, region);
    return undefined;
  }

  /** Whether a deletion is open (a header's, footer's or note's writing settles it by leaving its text out). */
  get deleting(): boolean {
    return [...this.#open.values()].some((c) => c.kind === 'deletion');
  }

  /** Whether any change is open. */
  get open(): boolean {
    return this.#open.size > 0;
  }

  /** What an inline read now is part of: a run's format change with its formatting before (its own, when unsaid). */
  inline(run?: { style?: string; props: TextProps }): InlineSuggested | undefined {
    let out: InlineSuggested | undefined;
    for (const change of this.#open.values()) {
      if (change.kind === 'insertion' && !out?.insertion) out = { ...out, insertion: change.mark };
      else if (change.kind === 'deletion' && !out?.deletion)
        out = { ...out, deletion: change.mark };
      else if (change.kind === 'format' && run && !out?.format)
        out = { ...out, format: { ...change.mark, before: runBefore(change.before, run) } };
    }
    return out;
  }

  /** A paragraph starting now: its break inserted, or deleted, where a range runs into it. */
  paragraphStart(): ParagraphSuggested | undefined {
    let out: ParagraphSuggested | undefined;
    for (const change of this.#open.values()) {
      if (change.kind === 'insertion' && !out?.break) out = { ...out, break: change.mark };
      if (change.kind === 'deletion' && !out?.join) out = { ...out, join: change.mark };
    }
    return out;
  }

  /** The paragraph format change a paragraph just read opened, once. */
  takeParagraphFormat(paragraph: {
    style: string;
    props: ParagraphProps;
  }): FileParagraphFormatChange | undefined {
    const change = this.#paragraphFormat;
    this.#paragraphFormat = undefined;
    if (!change) return undefined;
    const before = isObject(change.before) ? change.before : {};
    return {
      ...change.mark,
      before: {
        style: typeof before.style === 'string' ? before.style : paragraph.style,
        props: isObject(before.props) ? before.props : paragraph.props,
        ...(isObject(before.list) ? { list: before.list as never } : {}),
      },
    };
  }
}

/** A format change's formatting before: LiveDoc's own, else the run's (another suite's file keeps none). */
function runBefore(
  said: unknown,
  run: { style?: string; props: TextProps },
): FileFormatChange['before'] {
  if (isObject(said) && isObject(said.props))
    return {
      ...(typeof said.style === 'string' ? { style: said.style } : {}),
      props: said.props,
    };
  return { ...(run.style === undefined ? {} : { style: run.style }), props: run.props };
}

// ---- Writing ----

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The changed regions a written document lists, each range given its own id; `text:tracked-changes` of them. */
export class OdfChangeRegions {
  readonly #regions: string[] = [];

  /** A new region for one range of a suggestion; its id for the range's marks. */
  add(
    kind: Kind,
    mark: FileSuggestionMark,
    extra: { before?: unknown; paragraph?: boolean } = {},
  ): string {
    const id = `ct${this.#regions.length + 1}`;
    const element = kind === 'format' ? 'text:format-change' : `text:${kind}`;
    const date =
      mark.at === undefined
        ? ''
        : `<dc:date>${new Date(mark.at).toISOString().replace(/\.\d{3}Z$/, 'Z')}</dc:date>`;
    const own = `f.${id}` === mark.id ? '' : ` livedoc:suggestion="${escape(mark.id)}"`;
    const before =
      extra.before === undefined ? '' : ` livedoc:before="${escape(JSON.stringify(extra.before))}"`;
    const paragraph = extra.paragraph ? ' livedoc:paragraph="true"' : '';
    this.#regions.push(
      `<text:changed-region xml:id="${id}" text:id="${id}"${own}${before}${paragraph}><${element}><office:change-info><dc:creator>${escape(mark.author.name)}</dc:creator>${date}</office:change-info></${element}></text:changed-region>`,
    );
    return id;
  }

  get size(): number {
    return this.#regions.length;
  }

  /** The regions as `text:tracked-changes`, or inside a kept one; none when there are none. */
  xml(kept?: string): string {
    if (this.#regions.length === 0) return kept ?? '';
    const regions = this.#regions.join('');
    if (kept) return kept.replace(/<\/((?:[\w.-]+:)?tracked-changes)>\s*$/, `${regions}</$1>`);
    return `<text:tracked-changes text:track-changes="false">${regions}</text:tracked-changes>`;
  }
}

export const changeStartXml = (id: string): string => `<text:change-start text:change-id="${id}"/>`;
export const changeEndXml = (id: string): string => `<text:change-end text:change-id="${id}"/>`;

/** An inline's open changes by kind, as a key for stretches: each kind's suggestion id or none. */
export const inlineChangeKey = (
  suggested: InlineSuggested | undefined,
): Record<Kind, string | undefined> => ({
  insertion: suggested?.insertion?.id,
  deletion: suggested?.deletion?.id,
  format: suggested?.format?.id,
});
