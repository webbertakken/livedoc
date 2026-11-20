// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page setup": Set as default keeps the person's default page setup in
// their preferences, read back checked; a new document's setup is theirs, else the locale's paper.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageSetup, TextDocumentState } from '@livedoc/text-documents';
import { readUserPreferences, STORAGE_KEY } from '@/lib/user-preferences';
import {
  applyDefaultPageSetupToNew,
  pageSetupForNewDocument,
  readDefaultPageSetup,
  saveDefaultPageSetup,
} from './text-document-page-defaults';

vi.mock('@/lib/preferences-sync', async (original) => ({
  ...(await original<typeof import('@/lib/preferences-sync')>()),
  savePreferences: vi.fn(),
}));

const { savePreferences } = await import('@/lib/preferences-sync');

const a5 = { ...PageSetup.withPaper(PageSetup.of('letter'), 'a5'), pageColor: '#fff2cc' };

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(savePreferences).mockClear();
});

describe('readDefaultPageSetup and saveDefaultPageSetup', () => {
  it('reads none saved as none', () => {
    expect(readDefaultPageSetup()).toBeNull();
  });

  it('keeps the sides, orientation, margins and colour, synced for the person, and reads them back', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tourSeen: true }));
    saveDefaultPageSetup({ ...a5, columns: { count: 2, gap: 36 } }, 'owner-1');
    expect(readUserPreferences()).toEqual({ tourSeen: true, textDocumentPageSetup: a5 });
    expect(savePreferences).toHaveBeenCalled();
    expect(readDefaultPageSetup()).toEqual(a5);
  });

  it('ignores a kept setup that does not read back, and logs it', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ textDocumentPageSetup: { width: 'wide' } }),
    );
    expect(readDefaultPageSetup()).toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[text-document] default page setup unreadable');
  });
});

describe('pageSetupForNewDocument', () => {
  it('gives the person default', () => {
    expect(pageSetupForNewDocument(a5, 'en-US', 'odf')).toEqual(a5);
  });

  it('gives the locale paper when none is saved, and nothing where that is what a new document has', () => {
    expect(pageSetupForNewDocument(null, 'en-GB', 'odf')).toEqual(PageSetup.of('a4'));
    expect(pageSetupForNewDocument(null, 'en-US', 'odf')).toBeNull();
    expect(pageSetupForNewDocument(PageSetup.of('letter'), 'nl-NL', 'odf')).toBeNull();
  });
});

describe('applyDefaultPageSetupToNew', () => {
  it('sets a new document first section to the person default, never as an undo step', () => {
    saveDefaultPageSetup(a5, null);
    const doc = TextDocumentState.load();
    expect(applyDefaultPageSetupToNew(doc, 'odf', 'en-US')).toBe(true);
    expect(TextDocumentState.section(doc, 'odf').setup).toEqual(a5);
  });

  it('leaves a document whose section is already its own', () => {
    saveDefaultPageSetup(a5, null);
    const doc = TextDocumentState.load();
    TextDocumentState.setSection(doc, { start: 'next-page', setup: PageSetup.of('legal') });
    expect(applyDefaultPageSetupToNew(doc, 'odf', 'en-US')).toBe(false);
    expect(TextDocumentState.section(doc, 'odf').setup).toEqual(PageSetup.of('legal'));
  });

  it('writes nothing where the new document already has the setup', () => {
    const doc = TextDocumentState.load();
    expect(applyDefaultPageSetupToNew(doc, 'odf', 'en-US')).toBe(false);
    expect(TextDocumentState.metaType(doc).has('section')).toBe(false);
  });
});
