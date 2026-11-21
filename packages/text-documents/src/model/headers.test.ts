// docs/specs/034-text-documents/page-layout.md "Headers and footers": which header a page shows, a section's linked to
// the previous one's, an empty one, and the margins' default.
import { describe, expect, it } from 'vitest';
import { Paragraph } from './blocks';
import {
  HEADER_FOOTER_MARGIN_PT,
  HeadersAndFooters,
  type HeaderFooter,
  type SectionHeaders,
} from './headers';
import { PageSetup } from './sections';

const of = (text: string): HeaderFooter => ({ blocks: [Paragraph.of(text, 'Standard')] });
const textOf = (h: HeaderFooter | undefined) =>
  h?.blocks.map((b) => (b.type === 'paragraph' ? Paragraph.text(b) : '')).join('|');

describe('HeadersAndFooters.slotOf', () => {
  const all: SectionHeaders = { differentFirst: true, differentOddEven: true };

  it('is the default without first or odd and even', () => {
    expect(HeadersAndFooters.slotOf(undefined, true, 1)).toBe('default');
    expect(HeadersAndFooters.slotOf({}, true, 2)).toBe('default');
  });

  it("is the first on the section's first page with Different first page", () => {
    expect(HeadersAndFooters.slotOf(all, true, 2)).toBe('first');
    expect(HeadersAndFooters.slotOf({ differentFirst: true }, false, 2)).toBe('default');
  });

  it('is the even on an even page with Different odd and even, the default on odd ones', () => {
    expect(HeadersAndFooters.slotOf(all, false, 4)).toBe('even');
    expect(HeadersAndFooters.slotOf(all, false, 5)).toBe('default');
    expect(HeadersAndFooters.slotOf({ differentOddEven: true }, true, 2)).toBe('even');
  });
});

describe('HeadersAndFooters.resolve', () => {
  it("gives a section the previous section's header of a kind it has none of", () => {
    const resolved = HeadersAndFooters.resolve([
      { header: { default: of('One'), first: of('Cover') }, footer: { default: of('Foot') } },
      { header: { default: of('Two') } },
      undefined,
    ]);
    expect(textOf(resolved[0]!.header.default)).toBe('One');
    expect(textOf(resolved[1]!.header.default)).toBe('Two');
    expect(textOf(resolved[1]!.header.first)).toBe('Cover');
    expect(textOf(resolved[1]!.footer.default)).toBe('Foot');
    expect(textOf(resolved[2]!.header.default)).toBe('Two');
  });

  it('gives the first section none of a kind it lacks', () => {
    const [first] = HeadersAndFooters.resolve([{ header: { default: of('Only') } }]);
    expect(first!.footer.default).toBeUndefined();
    expect(first!.header.even).toBeUndefined();
  });

  it("keeps a section's own empty header unlinked", () => {
    const resolved = HeadersAndFooters.resolve([
      { header: { default: of('One') } },
      { header: { default: { blocks: [] } } },
    ]);
    expect(resolved[1]!.header.default).toEqual({ blocks: [] });
  });

  it("keeps each section's own switches, never the previous one's", () => {
    const resolved = HeadersAndFooters.resolve([{ differentFirst: true }, {}]);
    expect(resolved[0]!.differentFirst).toBe(true);
    expect(resolved[1]!.differentFirst).toBe(false);
  });
});

describe('HeadersAndFooters.isEmpty', () => {
  it('is empty with no blocks or one empty paragraph', () => {
    expect(HeadersAndFooters.isEmpty(undefined)).toBe(true);
    expect(HeadersAndFooters.isEmpty({ blocks: [] })).toBe(true);
    expect(HeadersAndFooters.isEmpty(of(''))).toBe(true);
    expect(HeadersAndFooters.isEmpty(of('Text'))).toBe(false);
  });
});

describe('HeadersAndFooters.margin', () => {
  it("is the setup's, else half an inch", () => {
    const setup = PageSetup.of('letter');
    expect(HEADER_FOOTER_MARGIN_PT).toBe(36);
    expect(HeadersAndFooters.margin(setup, 'header')).toBe(36);
    const own = { ...setup, margins: { ...setup.margins, header: 20, footer: 30 } };
    expect(HeadersAndFooters.margin(own, 'header')).toBe(20);
    expect(HeadersAndFooters.margin(own, 'footer')).toBe(30);
  });
});
