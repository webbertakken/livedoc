// Headers and footers (docs/specs/034-text-documents/page-layout.md "Headers and footers"): a section's default, first
// page and even page header and footer, each writing of its own; which one a page shows; one a section has not made its
// own linked to the previous section's; and the margins they stand at.
import type { Block } from './blocks';
import type { PageSetup } from './sections';

export type HeaderFooterKind = 'header' | 'footer';
export type HeaderFooterSlot = 'default' | 'first' | 'even';

export const HEADER_FOOTER_KINDS: readonly HeaderFooterKind[] = ['header', 'footer'];
export const HEADER_FOOTER_SLOTS: readonly HeaderFooterSlot[] = ['default', 'first', 'even'];

/** One header or footer: its blocks, and the package part it came from, written back under it. */
export type HeaderFooter = {
  readonly blocks: readonly Block[];
  readonly part?: string;
};

export type HeaderFooterSet = Readonly<Partial<Record<HeaderFooterSlot, HeaderFooter>>>;

/** A section's own headers and footers; a slot absent is linked to the previous section's. */
export type SectionHeaders = {
  readonly header?: HeaderFooterSet;
  readonly footer?: HeaderFooterSet;
  readonly differentFirst?: true;
  readonly differentOddEven?: true;
};

/** A section's headers and footers with linking followed: what its pages show. */
export type ResolvedHeaders = {
  readonly header: HeaderFooterSet;
  readonly footer: HeaderFooterSet;
  readonly differentFirst: boolean;
  readonly differentOddEven: boolean;
};

/** The header and footer margins a section with none has: 0.5 in (assumed: Google's). */
export const HEADER_FOOTER_MARGIN_PT = 36;

export const HeadersAndFooters = {
  /** The header's distance from the top edge, or the footer's from the bottom edge, in points. */
  margin: (setup: PageSetup, kind: HeaderFooterKind): number =>
    setup.margins[kind] ?? HEADER_FOOTER_MARGIN_PT,
  /** The slot a page shows: first on the section's first page, even on an even page, when switched on. */
  slotOf: (
    headers: SectionHeaders | undefined,
    firstOfSection: boolean,
    pageNumber: number,
  ): HeaderFooterSlot => {
    if (headers?.differentFirst && firstOfSection) return 'first';
    if (headers?.differentOddEven && pageNumber % 2 === 0) return 'even';
    return 'default';
  },
  /** Each section's headers and footers, its own or else the previous section's, slot by slot; none for the first. */
  resolve: (sections: readonly (SectionHeaders | undefined)[]): ResolvedHeaders[] => {
    const out: ResolvedHeaders[] = [];
    for (const own of sections) {
      const previous = out.at(-1);
      const kind = (k: HeaderFooterKind): HeaderFooterSet => {
        const set: Partial<Record<HeaderFooterSlot, HeaderFooter>> = {};
        for (const slot of HEADER_FOOTER_SLOTS) {
          const h = own?.[k]?.[slot] ?? previous?.[k][slot];
          if (h) set[slot] = h;
        }
        return set;
      };
      out.push({
        header: kind('header'),
        footer: kind('footer'),
        differentFirst: own?.differentFirst === true,
        differentOddEven: own?.differentOddEven === true,
      });
    }
    return out;
  },
  /** Draws nothing: no blocks, or one paragraph with no characters. */
  isEmpty: (h: HeaderFooter | undefined): boolean =>
    !h ||
    h.blocks.length === 0 ||
    (h.blocks.length === 1 &&
      h.blocks[0]!.type === 'paragraph' &&
      h.blocks[0]!.inlines.every((i) => i.type === 'run' && i.text === '')),
} as const;
