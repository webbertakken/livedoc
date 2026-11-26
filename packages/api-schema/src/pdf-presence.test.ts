import { describe, expect, it } from 'vitest';
import {
  isPresenceOpKind,
  parsePdfPresence,
  PDF_PRESENCE_MAX_CHARS,
  PDF_PRESENCE_NAME_MAX_CHARS,
} from './index';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence": where a person is in a PDF document travels
// as presence, checked field by field before anyone draws it.

const place = { kind: 'pdf-presence', tabId: 't', page: 'p:12', mode: 'reviewing' };

describe('pdf-presence on the wire', () => {
  it('is presence: unordered, never logged or replayed', () => {
    expect(isPresenceOpKind('pdf-presence')).toBe(true);
  });

  it('keeps the tab, the page in view and the editing mode, holding nothing', () => {
    expect(parsePdfPresence(place)).toEqual({
      tabId: 't',
      page: 'p:12',
      mode: 'reviewing',
      held: null,
    });
    expect(parsePdfPresence({ ...place, page: 'n:Ab_9-x', mode: 'viewing', held: null })).toEqual({
      tabId: 't',
      page: 'n:Ab_9-x',
      mode: 'viewing',
      held: null,
    });
  });

  it('keeps a person who left the tab: the tab with no page', () => {
    expect(parsePdfPresence({ kind: 'pdf-presence', tabId: 't', page: null })).toEqual({
      tabId: 't',
      page: null,
    });
  });

  it('keeps at most one thing held: a text selection, a mark, an object, a text box typed in', () => {
    const text = { what: 'text', page: 'p:3', first: 0, last: 41 };
    expect(parsePdfPresence({ ...place, held: text })?.page).toBe('p:12');
    expect(parsePdfPresence({ ...place, held: text })).toMatchObject({ held: text });
    for (const what of ['mark', 'object', 'typing'] as const) {
      const held = { what, name: '7c9e6679-7425-40de-944b-e07fc1f90ae7' };
      expect(parsePdfPresence({ ...place, held })).toMatchObject({ held });
    }
  });

  it('keeps a mark the file named itself: a GUID in braces, a dotted name', () => {
    for (const name of ['{5B1C3D2E-0F4A-4B6C-9D8E-7F6A5B4C3D2E}', 'Annot.12.a']) {
      const held = { what: 'mark', name };
      expect(parsePdfPresence({ ...place, held })).toMatchObject({ held });
    }
  });

  it('carries nothing a sender added: only what the spec names crosses', () => {
    const parsed = parsePdfPresence({
      ...place,
      colour: 'red',
      held: { what: 'mark', name: 'm1', html: '<b>' },
    });
    expect(parsed).toEqual({
      tabId: 't',
      page: 'p:12',
      mode: 'reviewing',
      held: { what: 'mark', name: 'm1' },
    });
  });

  it.each([
    ['no op', null],
    ['no object', 'pdf-presence'],
    ['no tab', { ...place, tabId: undefined }],
    ['an empty tab', { ...place, tabId: '' }],
    ['no page', { ...place, page: undefined }],
    ['an empty page name', { ...place, page: '' }],
    ['a page name that is no token', { ...place, page: 'p 12' }],
    ['a page name that is markup', { ...place, page: '<img src=x>' }],
    ['a page name that is a number', { ...place, page: 12 }],
    ['a page name too long', { ...place, page: 'n:'.padEnd(PDF_PRESENCE_NAME_MAX_CHARS + 1, 'a') }],
    ['no mode', { ...place, mode: undefined }],
    ['a mode that is none', { ...place, mode: 'suggesting' }],
    ['something held that is no object', { ...place, held: 'p:3' }],
    ['something held of no kind', { ...place, held: { what: 'page', name: 'p:3' } }],
    ['a held name that is no token', { ...place, held: { what: 'mark', name: 'a"b' } }],
    ['a held name missing', { ...place, held: { what: 'object' } }],
    ['a selection on no page', { ...place, held: { what: 'text', first: 0, last: 1 } }],
    [
      'a selection that ends before it starts',
      { ...place, held: { what: 'text', page: 'p:3', first: 5, last: 4 } },
    ],
    [
      'a selection before the page',
      { ...place, held: { what: 'text', page: 'p:3', first: -1, last: 4 } },
    ],
    [
      'a selection at no whole character',
      { ...place, held: { what: 'text', page: 'p:3', first: 0.5, last: 4 } },
    ],
    [
      'a selection past any page',
      { ...place, held: { what: 'text', page: 'p:3', first: 0, last: 2 ** 53 } },
    ],
  ])('refuses %s', (_why, op) => {
    expect(parsePdfPresence(op)).toBeNull();
  });

  it('refuses an op that passes PDF_PRESENCE_MAX_CHARS as it was sent', () => {
    const long = (length: number) => ({ ...place, tabId: 't'.repeat(length) });
    const fits = long(100);
    const over = PDF_PRESENCE_MAX_CHARS - JSON.stringify(fits).length;
    expect(JSON.stringify(long(100 + over))).toHaveLength(PDF_PRESENCE_MAX_CHARS);
    expect(parsePdfPresence(long(100 + over))).not.toBeNull();
    expect(parsePdfPresence(long(100 + over + 1))).toBeNull();
    // What a sender pads an op with counts too: the op is measured as sent, not as read.
    expect(parsePdfPresence({ ...place, padding: 'x'.repeat(PDF_PRESENCE_MAX_CHARS) })).toBeNull();
  });
});
