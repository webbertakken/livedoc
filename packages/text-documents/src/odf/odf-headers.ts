// Headers and footers in an OpenDocument file (docs/specs/034-text-documents/page-layout.md "Headers and footers", "In
// the file"): a master page's `style:header` (every page, or the odd ones), `style:header-left` (the even ones) and
// `style:header-first`, the same for footers; a master page has no linking, so a section's header that is the previous
// section's, the same XML, reads as linked. With a header, the page layout's top margin is the header's, and the
// header's own height and spacing bring the body down to the top margin; footers mirror it at the foot.
import {
  attributeOf,
  childElement,
  odfLengthToPt,
  ptToOdf,
  type XmlElement,
} from '@livedoc/office-packages';
import {
  HEADER_FOOTER_KINDS,
  HEADER_FOOTER_MARGIN_PT,
  HEADER_FOOTER_SLOTS,
  type HeaderFooter,
  type HeaderFooterKind,
  type HeaderFooterSlot,
  type ResolvedHeaders,
  type SectionHeaders,
} from '../model/headers';
import type { PageSetup } from '../model/sections';
import { NS } from './odf-names';

/** A master page's element for each kind and slot. */
export const HEADER_ELEMENT: Record<HeaderFooterKind, Record<HeaderFooterSlot, string>> = {
  header: { default: 'header', even: 'header-left', first: 'header-first' },
  footer: { default: 'footer', even: 'footer-left', first: 'footer-first' },
};

/** The order a master page holds them in (ODF 1.4, `style:master-page`). */
const ELEMENT_ORDER: readonly [HeaderFooterKind, HeaderFooterSlot][] = [
  ['header', 'default'],
  ['header', 'even'],
  ['header', 'first'],
  ['footer', 'default'],
  ['footer', 'even'],
  ['footer', 'first'],
];

/** A master page's shown header and footer elements by kind and slot; one with `style:display="false"` is none. */
export function masterStoryElements(
  master: XmlElement,
): Partial<Record<HeaderFooterKind, Partial<Record<HeaderFooterSlot, XmlElement>>>> {
  const out: Partial<Record<HeaderFooterKind, Partial<Record<HeaderFooterSlot, XmlElement>>>> = {};
  for (const kind of HEADER_FOOTER_KINDS)
    for (const slot of HEADER_FOOTER_SLOTS) {
      const e = childElement(master, NS.style, HEADER_ELEMENT[kind][slot]);
      if (e && attributeOf(e, NS.style, 'display') !== 'false') (out[kind] ??= {})[slot] = e;
    }
  return out;
}

/**
 * Each section's headers as their own, given every section's as its master page holds them: a slot whose XML is the
 * previous section's resolved one is linked (left out); a default the previous section has and this master page lacks,
 * and a first or even one it switches on and lacks, is its own empty one. The first section's are as they are.
 */
export function unlinked(
  sections: readonly (SectionHeaders | undefined)[],
  xmlOf: (story: HeaderFooter) => string,
): (SectionHeaders | undefined)[] {
  const out: (SectionHeaders | undefined)[] = [];
  let previous: Partial<Record<HeaderFooterKind, Partial<Record<HeaderFooterSlot, HeaderFooter>>>> =
    {};
  sections.forEach((own, i) => {
    if (i === 0) {
      // The first section's empty ones are none.
      const kind = (set: Partial<Record<HeaderFooterSlot, HeaderFooter>> | undefined) => {
        const kept = Object.entries(set ?? {}).filter(([, story]) => story.blocks.length > 0);
        return kept.length > 0
          ? (Object.fromEntries(kept) as Partial<Record<HeaderFooterSlot, HeaderFooter>>)
          : undefined;
      };
      const header = kind(own?.header);
      const footer = kind(own?.footer);
      const first: SectionHeaders = {
        ...(header ? { header } : {}),
        ...(footer ? { footer } : {}),
        ...(own?.differentFirst ? { differentFirst: true as const } : {}),
        ...(own?.differentOddEven ? { differentOddEven: true as const } : {}),
      };
      out.push(Object.keys(first).length > 0 ? first : undefined);
      previous = { header: { ...header }, footer: { ...footer } };
      return;
    }
    const kinds: Partial<
      Record<HeaderFooterKind, Partial<Record<HeaderFooterSlot, HeaderFooter>>>
    > = {};
    const resolved: typeof previous = {};
    for (const kind of HEADER_FOOTER_KINDS)
      for (const slot of HEADER_FOOTER_SLOTS) {
        const mine = own?.[kind]?.[slot];
        const before = previous[kind]?.[slot];
        const used =
          slot === 'default' ||
          (slot === 'first' && own?.differentFirst) ||
          (slot === 'even' && own?.differentOddEven);
        const empty = (story: HeaderFooter | undefined) => !story || story.blocks.length === 0;
        const same = empty(mine) ? empty(before) : !!before && xmlOf(before) === xmlOf(mine!);
        let kept: HeaderFooter | undefined;
        if (mine && !same) kept = mine;
        else if (!mine && before && used) kept = { blocks: [] };
        if (kept) (kinds[kind] ??= {})[slot] = kept;
        const shown = kept ?? before;
        if (shown) (resolved[kind] ??= {})[slot] = shown;
      }
    previous = resolved;
    const headers: SectionHeaders = {
      ...(kinds.header ? { header: kinds.header } : {}),
      ...(kinds.footer ? { footer: kinds.footer } : {}),
      ...(own?.differentFirst ? { differentFirst: true as const } : {}),
      ...(own?.differentOddEven ? { differentOddEven: true as const } : {}),
    };
    out.push(Object.keys(headers).length > 0 ? headers : undefined);
  });
  return out;
}

const PROPERTIES = 'header-footer-properties';

/** The height and spacing a page layout's header or footer style gives, in points. */
function heightAndSpacing(layout: XmlElement, kind: HeaderFooterKind): number {
  const style = childElement(layout, NS.style, `${kind}-style`);
  const props = style && childElement(style, NS.style, PROPERTIES);
  if (!props) return 0;
  const height =
    odfLengthToPt(attributeOf(props, NS.svg, 'height')) ??
    odfLengthToPt(attributeOf(props, NS.fo, 'min-height')) ??
    0;
  const spacing =
    odfLengthToPt(attributeOf(props, NS.fo, kind === 'header' ? 'margin-bottom' : 'margin-top')) ??
    0;
  return height + spacing;
}

/** A setup read from a page layout, its margins as the model has them when its master page shows a header or footer. */
export function withHeaderMargins(
  setup: PageSetup,
  layout: XmlElement,
  shown: { header: boolean; footer: boolean },
): PageSetup {
  const m = setup.margins;
  const round = (pt: number) => Math.round(pt * 1000) / 1000;
  // A margin at the default is none, as a new document has it.
  const own = (kind: HeaderFooterKind, pt: number) =>
    pt === HEADER_FOOTER_MARGIN_PT ? {} : { [kind]: pt };
  return {
    ...setup,
    margins: {
      ...m,
      ...(shown.header
        ? { ...own('header', m.top), top: round(m.top + heightAndSpacing(layout, 'header')) }
        : {}),
      ...(shown.footer
        ? {
            ...own('footer', m.bottom),
            bottom: round(m.bottom + heightAndSpacing(layout, 'footer')),
          }
        : {}),
    },
  };
}

/** Which kinds a section's master page shows: a kind with any non-empty slot. */
export function shownKinds(resolved: ResolvedHeaders | undefined): {
  header: boolean;
  footer: boolean;
} {
  const any = (kind: HeaderFooterKind) =>
    HEADER_FOOTER_SLOTS.some((slot) => written(resolved, kind, slot) !== undefined);
  return { header: any('header'), footer: any('footer') };
}

/** The story a master page writes for a slot: the resolved one when the section uses that slot and it has blocks. */
export function written(
  resolved: ResolvedHeaders | undefined,
  kind: HeaderFooterKind,
  slot: HeaderFooterSlot,
): HeaderFooter | undefined {
  if (!resolved) return undefined;
  if (slot === 'first' && !resolved.differentFirst) return undefined;
  if (slot === 'even' && !resolved.differentOddEven) return undefined;
  const story = resolved[kind][slot];
  return story && story.blocks.length > 0 ? story : undefined;
}

/**
 * A master page's header and footer elements, in the schema's order, each story's content from `content`. A first or
 * even slot switched on with nothing in it is written empty where the kind has a default: an OpenDocument page without
 * it would show the default. Read back, an element holding nothing but an empty paragraph is an empty one.
 */
export function masterStoriesXml(
  resolved: ResolvedHeaders | undefined,
  content: (story: HeaderFooter) => string,
): string {
  return ELEMENT_ORDER.map(([kind, slot]) => {
    const name = HEADER_ELEMENT[kind][slot];
    const story = written(resolved, kind, slot);
    if (story) return `<style:${name}>${content(story)}</style:${name}>`;
    const switchedOn =
      (slot === 'first' && resolved?.differentFirst) ||
      (slot === 'even' && resolved?.differentOddEven);
    // LibreOffice reads an element without a paragraph as none: an empty one holds an empty paragraph.
    return switchedOn && written(resolved, kind, 'default')
      ? `<style:${name}><text:p/></style:${name}>`
      : '';
  }).join('');
}

/**
 * A page layout's margins and header and footer styles for a setup: with a header, the top margin is the header's and
 * the header's minimum height brings the body to the top margin, its spacing grown as LibreOffice reads a Word file.
 */
export function headerLayout(
  setup: PageSetup,
  shown: { header: boolean; footer: boolean },
): { setup: PageSetup; styles: string } {
  const m = setup.margins;
  const header = m.header ?? HEADER_FOOTER_MARGIN_PT;
  const footer = m.footer ?? HEADER_FOOTER_MARGIN_PT;
  const style = (kind: HeaderFooterKind, height: number) =>
    `<style:${kind}-style><style:${PROPERTIES} fo:min-height="${ptToOdf(Math.max(0, height))}" fo:${kind === 'header' ? 'margin-bottom' : 'margin-top'}="0pt" style:dynamic-spacing="true"/></style:${kind}-style>`;
  return {
    setup: {
      ...setup,
      margins: {
        ...m,
        ...(shown.header ? { top: header } : {}),
        ...(shown.footer ? { bottom: footer } : {}),
      },
    },
    styles:
      (shown.header ? style('header', m.top - header) : '') +
      (shown.footer ? style('footer', m.bottom - footer) : ''),
  };
}

const STORY_ELEMENT = /<style:(header|footer)(-left|-first)?\b(?:[^>]*\/>|[\s\S]*?<\/style:\1\2>)/g;

/** A kept master page's XML with its headers and footers replaced by `stories`, its other children kept. */
export function withStories(master: string, stories: string): string {
  const rest = master.replace(STORY_ELEMENT, '');
  const open = rest.match(/^<style:master-page\b[^>]*?(\/?)>/);
  if (!open) return master;
  if (open[1])
    return stories ? `${open[0].replace(/\s*\/>$/, '>')}${stories}</style:master-page>` : rest;
  return `${open[0]}${stories}${rest.slice(open[0].length)}`;
}

/** A master page's XML without its headers and footers, the space between its children gone. */
export const withoutStories = (master: string): string =>
  master.replace(STORY_ELEMENT, '').replace(/>\s+</g, '><');
