// The watermark (docs/specs/034-text-documents/page-layout.md "Watermark"): the document's own mark, drawn behind the
// writing on every page. A file holds it in its headers, as each suite writes one; reading lifts it out of every header
// into the document, and writing places it into every header a section's pages show, making the empty ones it needs.
// Format-neutral: each format reads and makes the kept element that holds it (ooxml-watermark.ts, odf-watermark.ts).
import type { Block, Inline, KeptInline, Paragraph, SectionBreak } from './blocks';
import {
  HEADER_FOOTER_SLOTS,
  HeadersAndFooters,
  type HeaderFooter,
  type HeaderFooterSlot,
  type SectionHeaders,
} from './headers';
import type { PageSetup, Section } from './sections';
import type { TextDocument } from './text-document';

export type WatermarkLayout = 'diagonal' | 'horizontal';

/** A text watermark: its words, font, size in points (absent is Auto, fitting the text width), colour, transparency. */
export type TextWatermark = {
  readonly kind: 'text';
  readonly text: string;
  readonly font: string;
  readonly size?: number;
  readonly bold?: true;
  readonly italic?: true;
  /** `#rrggbb`. */
  readonly colour: string;
  /** 0 (opaque) to 1 (clear). */
  readonly transparency: number;
  readonly layout: WatermarkLayout;
};

export type Watermark = TextWatermark;

/** What each format's watermark element is named from: Word's and LibreOffice's. */
export const WATERMARK_NAME_PREFIX = 'PowerPlusWaterMarkObject';

/** A new text watermark's look where LiveDoc makes one (default). */
export const WATERMARK_DEFAULTS = {
  font: 'Arial',
  colour: '#c0c0c0',
  transparency: 0.5,
  layout: 'diagonal',
} as const;

/** The element that holds a watermark in a header, made for its section's page, centred on its text area. */
export type WatermarkElement = (watermark: Watermark, setup: PageSetup) => KeptInline;

const isWatermark = (xml: { readonly xml: string }) => xml.xml.includes(WATERMARK_NAME_PREFIX);

export const Watermarks = {
  /** A text watermark of these words in the default look. */
  text: (text: string): TextWatermark => ({ kind: 'text', text, ...WATERMARK_DEFAULTS }),
  /** It draws something: it has words. */
  draws: (watermark: Watermark | undefined): watermark is Watermark =>
    watermark !== undefined && watermark.text.trim() !== '',

  /**
   * The document with the first watermark its headers hold lifted out: `read` tells a kept element holding one; every
   * such element taken out of every header, and a header it leaves as one empty paragraph taken away.
   */
  lift: (
    document: TextDocument,
    read: (kept: Block | Inline) => Watermark | null,
  ): TextDocument => {
    let found: Watermark | undefined;
    const take = (kept: Block | Inline): boolean => {
      if (kept.type !== 'kept' || !isWatermark(kept.xml)) return false;
      const watermark = read(kept);
      if (!watermark) return false;
      found ??= watermark;
      return true;
    };
    const story = (h: HeaderFooter): HeaderFooter | undefined => {
      let lifted = false;
      const blocks = h.blocks.flatMap((b): Block[] => {
        if (take(b)) {
          lifted = true;
          return [];
        }
        if (b.type !== 'paragraph') return [b];
        const inlines = b.inlines.filter((i) => !take(i));
        if (inlines.length === b.inlines.length) return [b];
        lifted = true;
        // A paragraph that held only the watermark goes with it.
        return inlines.length > 0 ? [{ ...b, inlines }] : [];
      });
      if (!lifted) return h;
      const next = { ...h, blocks };
      return HeadersAndFooters.isEmpty(next) ? undefined : next;
    };
    const headers = (own: SectionHeaders | undefined) => mapStories(own, story);
    const section = <S extends Section>(s: S): S => withHeaders(s, headers(s.headers));
    const lifted: TextDocument = {
      ...document,
      section: section(document.section),
      body: document.body.map((b) => (b.type === 'section' ? section(b) : b)),
    };
    if (!found) return document;
    return { ...lifted, watermark: found };
  },

  /**
   * The document with its watermark in every header its sections' pages show: a section's own, and an empty one made
   * where the first section shows none; a watermark without words places nothing.
   */
  place: (document: TextDocument, make: WatermarkElement, normal: string): TextDocument => {
    const watermark = document.watermark;
    if (!Watermarks.draws(watermark)) return document;
    const holding = (h: HeaderFooter, setup: PageSetup): HeaderFooter => {
      // A paragraph of its own before the header's writing, as Word's building block is.
      const style = h.blocks.find((b) => b.type === 'paragraph')?.style ?? normal;
      return { ...h, blocks: [ownParagraph(style, make(watermark, setup)), ...h.blocks] };
    };
    const section = <S extends Section>(s: S, first: boolean): S => {
      const own = s.headers;
      const shown: HeaderFooterSlot[] = HEADER_FOOTER_SLOTS.filter(
        (slot) =>
          slot === 'default' ||
          (slot === 'first' && own?.differentFirst) ||
          (slot === 'even' && own?.differentOddEven),
      );
      // Its own headers, shown or not, as Word writes them; a slot it links keeps the previous section's, which holds
      // the watermark already; the first section links to none, so it is given the ones its pages show.
      const header: Partial<Record<HeaderFooterSlot, HeaderFooter>> = {};
      for (const slot of HEADER_FOOTER_SLOTS) {
        const story =
          own?.header?.[slot] ?? (first && shown.includes(slot) ? { blocks: [] } : undefined);
        if (story) header[slot] = holding(story, s.setup);
      }
      if (Object.keys(header).length === 0) return s;
      return withHeaders(s, { ...own, header });
    };
    return {
      ...document,
      section: section(document.section, true),
      body: document.body.map((b) => (b.type === 'section' ? section(b, false) : b)),
    };
  },
} as const;

const ownParagraph = (style: string, element: KeptInline): Paragraph => ({
  type: 'paragraph',
  style,
  props: {},
  inlines: [element],
});

function mapStories(
  own: SectionHeaders | undefined,
  story: (h: HeaderFooter) => HeaderFooter | undefined,
): SectionHeaders | undefined {
  if (!own) return own;
  const kind = (set: SectionHeaders['header']) => {
    if (!set) return set;
    const out: Partial<Record<HeaderFooterSlot, HeaderFooter>> = {};
    for (const slot of HEADER_FOOTER_SLOTS) {
      const h = set[slot] && story(set[slot]);
      if (h) out[slot] = h;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const { header, footer, ...rest } = own;
  const next: SectionHeaders = {
    ...rest,
    ...(kind(header) ? { header: kind(header) } : {}),
    ...(kind(footer) ? { footer: kind(footer) } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
}

function withHeaders<S extends Section | SectionBreak>(
  s: S,
  headers: SectionHeaders | undefined,
): S {
  const { headers: _, ...rest } = s;
  return (headers ? { ...rest, headers } : rest) as S;
}
