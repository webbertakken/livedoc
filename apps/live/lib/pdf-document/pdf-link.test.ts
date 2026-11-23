// docs/specs/035-pdf-documents/reading-surface.md "Following a link": what a press on a bookmark or a link does.
import { describe, expect, it } from 'vitest';
import { PageName } from '@livedoc/pdf-documents';
import { pdfLinkName, pdfLinkOutcome, placeOnPage, schemeOf } from './pdf-link';

const PAGES = [PageName.ofObject(3), PageName.ofObject(5)];

describe('following a link', () => {
  it('goes to a place in the document at once', () => {
    expect(
      pdfLinkOutcome({ kind: 'place', page: PageName.ofObject(5), x: null, y: 40 }, PAGES),
    ).toEqual({ kind: 'go', index: 1 });
  });

  it('goes nowhere for a page no longer in the document, or no target', () => {
    expect(
      pdfLinkOutcome({ kind: 'place', page: PageName.ofObject(9), x: null, y: null }, PAGES),
    ).toEqual({ kind: 'nowhere' });
    expect(pdfLinkOutcome(null, PAGES)).toEqual({ kind: 'nowhere' });
  });

  it('asks before an address, and says why one is not opened', () => {
    expect(pdfLinkOutcome({ kind: 'address', address: 'https://example.com/a' }, PAGES)).toEqual({
      kind: 'ask',
      address: 'https://example.com/a',
    });
    expect(
      pdfLinkOutcome(
        { kind: 'refused', reason: 'link_scheme_refused', address: 'javascript:alert(1)' },
        PAGES,
      ),
    ).toEqual({ kind: 'refused', address: 'javascript:alert(1)' });
    expect(pdfLinkOutcome({ kind: 'file', path: '../other.pdf' }, PAGES)).toEqual({
      kind: 'file',
      path: '../other.pdf',
    });
    expect(pdfLinkOutcome({ kind: 'action', action: 'launch' }, PAGES)).toEqual({
      kind: 'action',
    });
  });

  it('names an address by its scheme alone, for the log', () => {
    expect(schemeOf('https://example.com/secret?q=1')).toBe('https');
    expect(schemeOf('mailto:ada@example.com')).toBe('mailto');
  });
});

// "Links": a link is named for where it leads, its tooltip the target alone, as plain text.
describe('what a link on a page is called', () => {
  const pages = [
    { name: PageName.ofObject(3), label: null },
    { name: PageName.ofObject(5), label: 'iv' },
  ];
  const place = (n: number) => ({
    kind: 'place' as const,
    page: PageName.ofObject(n),
    x: null,
    y: null,
  });

  it('names a place by its page’s label or number', () => {
    expect(pdfLinkName(place(3), pages)).toEqual({ name: 'Link to page 1', tip: 'Page 1' });
    expect(pdfLinkName(place(5), pages)).toEqual({ name: 'Link to page iv', tip: 'Page iv' });
    expect(pdfLinkName(place(9), pages)).toEqual({
      name: 'Link that goes nowhere',
      tip: 'Goes nowhere',
    });
  });

  it('names an address, a file and an action by what they are', () => {
    const address = 'https://example.com/a';
    expect(pdfLinkName({ kind: 'address', address }, pages)).toEqual({
      name: `Link to ${address}`,
      tip: address,
    });
    expect(
      pdfLinkName(
        { kind: 'refused', reason: 'link_scheme_refused', address: 'javascript:x' },
        pages,
      ),
    ).toEqual({ name: 'Link to javascript:x', tip: 'javascript:x' });
    expect(pdfLinkName({ kind: 'file', path: 'other.pdf' }, pages)).toEqual({
      name: 'Link to another file',
      tip: 'other.pdf',
    });
    expect(pdfLinkName({ kind: 'action', action: 'launch' }, pages)).toEqual({
      name: 'Link to an action',
      tip: 'An action',
    });
  });
});

// "Following a link": the place's point at the view's top left, reckoned through the page's matrix.
describe('where on its page a place is', () => {
  const UPRIGHT = [1, 0, 0, -1, 0, 792] as const;
  // A quarter turn clockwise: page space's (x, y) shows at (792 - y, x).
  const TURNED = [0, 1, -1, 0, 792, 0] as const;
  const letter = { width: 612, height: 792 };

  it('reckons the point through the matrix, upright or turned', () => {
    expect(placeOnPage(UPRIGHT, letter, { x: 306, y: 594 })).toEqual({ across: 0.5, down: 0.25 });
    expect(placeOnPage(TURNED, { width: 792, height: 612 }, { x: 306, y: 594 })).toEqual({
      across: 0.25,
      down: 0.5,
    });
  });

  it('keeps the page’s own edge for a coordinate the file leaves out', () => {
    expect(placeOnPage(UPRIGHT, letter, { x: null, y: 594 })).toEqual({ across: 0, down: 0.25 });
    expect(placeOnPage(UPRIGHT, letter, { x: 306, y: null })).toEqual({ across: 0.5, down: 0 });
  });

  it('keeps a point the file puts off the page on its edge', () => {
    expect(placeOnPage(UPRIGHT, letter, { x: -50, y: 2000 })).toEqual({ across: 0, down: 0 });
    expect(placeOnPage([0, 0, 0, 0, 0, 0], letter, { x: 1, y: 1 })).toEqual({ across: 0, down: 0 });
    expect(placeOnPage(UPRIGHT, { width: 0, height: 0 }, { x: 0, y: 792 })).toEqual({
      across: 0,
      down: 0,
    });
  });
});
