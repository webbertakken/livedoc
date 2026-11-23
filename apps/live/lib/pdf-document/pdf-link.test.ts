// docs/specs/035-pdf-documents/reading-surface.md "Following a link": what a press on a bookmark or a link does.
import { describe, expect, it } from 'vitest';
import { PageName } from '@livedoc/pdf-documents';
import { pdfLinkOutcome, schemeOf } from './pdf-link';

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
