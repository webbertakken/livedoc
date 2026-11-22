import { describe, expect, it } from 'vitest';
import { PDF_LINK_MAX_CHARS } from './limits';
import { LinkTarget } from './link-target';

// security.md "Links and actions": only `http`, `https`, `mailto` and places in the document are ever followed.
describe('LinkTarget.ofAddress', () => {
  it('answers an http, https or mailto address as one to show, then open', () => {
    expect(LinkTarget.ofAddress('https://example.com/path?q=1#top')).toEqual({
      kind: 'address',
      address: 'https://example.com/path?q=1#top',
    });
    expect(LinkTarget.ofAddress('HTTP://Example.COM')).toEqual({
      kind: 'address',
      address: 'http://example.com/',
    });
    expect(LinkTarget.ofAddress('mailto:ada@example.com')).toEqual({
      kind: 'address',
      address: 'mailto:ada@example.com',
    });
  });

  it('shows an address by where it leads: the name in its plain form, never a look-alike', () => {
    // The Cyrillic "а" in "аpple.com": the address shown is the one opened.
    expect(LinkTarget.ofAddress('https://\u0430pple.com/')).toEqual({
      kind: 'address',
      address: 'https://xn--pple-43d.com/',
    });
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'blob:https://example.com/1',
    'ms-word:ofe|u|https://example.com/a.docx',
  ])('never opens %s', (address) => {
    expect(LinkTarget.ofAddress(address)).toEqual({
      kind: 'refused',
      reason: 'link_scheme_refused',
      address: address.trim(),
    });
  });

  it('never opens an address with no scheme, or none at all', () => {
    expect(LinkTarget.ofAddress('chapter2.pdf')).toMatchObject({
      kind: 'refused',
      reason: 'link_scheme_refused',
    });
    expect(LinkTarget.ofAddress('//example.com/a')).toMatchObject({ kind: 'refused' });
    expect(LinkTarget.ofAddress('')).toMatchObject({ kind: 'refused', address: '' });
    expect(LinkTarget.ofAddress('https://')).toMatchObject({ kind: 'refused' });
  });

  it('shows an address past the limit cut, and never opens it', () => {
    const long = `https://example.com/${'a'.repeat(PDF_LINK_MAX_CHARS)}`;
    const target = LinkTarget.ofAddress(long);
    expect(target).toMatchObject({ kind: 'refused', reason: 'link_too_long' });
    expect(target.kind === 'refused' && target.address).toHaveLength(PDF_LINK_MAX_CHARS);
  });

  it('says whether a target may be followed at all', () => {
    expect(LinkTarget.follows({ kind: 'place', page: 'p:3', x: null, y: 700 })).toBe(true);
    expect(LinkTarget.follows({ kind: 'address', address: 'https://example.com/' })).toBe(true);
    expect(LinkTarget.follows({ kind: 'file', path: 'other.pdf' })).toBe(false);
    expect(LinkTarget.follows({ kind: 'action', action: 'launch' })).toBe(false);
    expect(LinkTarget.follows(LinkTarget.ofAddress('javascript:1'))).toBe(false);
  });
});
