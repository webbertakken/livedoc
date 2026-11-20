// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Default styles": kept in the person's preferences, read back
// checked, and a text document made here starting in them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StyleLooks, Styles, TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { readUserPreferences, STORAGE_KEY } from '@/lib/user-preferences';
import {
  readDefaultStyles,
  saveDefaultStyles,
  applyDefaultStylesToNew,
  stylesForNewDocument,
} from './text-document-default-styles';

vi.mock('@/lib/preferences-sync', async (original) => ({
  ...(await original<typeof import('@/lib/preferences-sync')>()),
  savePreferences: vi.fn(),
}));

const { savePreferences } = await import('@/lib/preferences-sync');

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(savePreferences).mockClear();
});

describe('readDefaultStyles and saveDefaultStyles', () => {
  it("reads none saved as Google's: an empty set", () => {
    expect(readDefaultStyles()).toEqual({});
  });

  it('saves a set into the preferences, synced for the person, and reads it back', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tourSeen: true }));
    saveDefaultStyles({ normal: { text: { font: 'Georgia' } } }, 'owner-1');
    expect(readUserPreferences()).toEqual({
      tourSeen: true,
      textDocumentDefaultStyles: { normal: { text: { font: 'Georgia' } } },
    });
    expect(savePreferences).toHaveBeenCalledWith('owner-1', expect.any(Object));
    expect(readDefaultStyles()).toEqual({ normal: { text: { font: 'Georgia' } } });
  });

  it("saving Google's own set keeps nothing", () => {
    saveDefaultStyles({ normal: { text: { size: 12 } } }, null);
    saveDefaultStyles({}, null);
    expect(readUserPreferences()).not.toHaveProperty('textDocumentDefaultStyles');
  });

  it('ignores a set that does not read back, whole, and logs it', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ textDocumentDefaultStyles: { normal: { text: { size: 'big' } } } }),
    );
    expect(readDefaultStyles()).toEqual({});
    expect(console.warn).toHaveBeenCalledWith('[text-document] default styles unreadable');
  });
});

describe('stylesForNewDocument', () => {
  const blank = TextDocument.blank({ format: 'odf' });
  const context = { styles: blank.styles, defaults: blank.defaults, format: 'odf' as const };

  it("changes nothing for Google's own set", () => {
    expect(stylesForNewDocument({}, context)).toEqual([]);
  });

  it('gives the styles that draw a new document in the saved looks', () => {
    const changed = stylesForNewDocument(
      { heading1: { text: { size: 30, color: '#112233' } } },
      context,
    );
    const after = blank.styles.map((s) => changed.find((c) => c.id === s.id) ?? s);
    const look = StyleLooks.of(after, blank.defaults, Styles.idOfRole(after, 'heading1'));
    expect(look.text).toMatchObject({ size: 30, color: '#112233' });
    expect(changed.map((s) => s.role)).toEqual(['heading1']);
  });
});

describe('applyDefaultStylesToNew', () => {
  const saved = { normal: { text: { font: 'Georgia' } } };

  it("sets a new document's styles to its maker's default styles", () => {
    saveDefaultStyles(saved, null);
    const doc = TextDocumentState.load();
    expect(applyDefaultStylesToNew(doc, 'odf')).toBe(true);
    const styles = TextDocumentState.styles(doc, 'odf');
    expect(
      StyleLooks.of(styles, TextDocumentState.defaults(doc, 'odf'), 'Standard').text.font,
    ).toBe('Georgia');
  });

  it('leaves a document when none are saved', () => {
    saveDefaultStyles({}, null);
    const doc = TextDocumentState.load();
    expect(applyDefaultStylesToNew(doc, 'odf')).toBe(false);
    expect(TextDocumentState.stylesType(doc).size).toBe(0);
  });

  it('leaves a document whose styles are already its own', () => {
    saveDefaultStyles(saved, null);
    const doc = TextDocumentState.load();
    const blank = TextDocument.blank({ format: 'odf' });
    TextDocumentState.setStyles(doc, 'odf', [blank.styles[0]!]);
    expect(applyDefaultStylesToNew(doc, 'odf')).toBe(false);
  });
});
