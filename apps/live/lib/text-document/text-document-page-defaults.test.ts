// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page setup", "Pageless": Set as default keeps the person's default page
// in their preferences, read back checked; a new document starts on theirs, else the locale's paper.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageSetup, TextDocumentState } from '@livedoc/text-documents';
import { readUserPreferences, STORAGE_KEY } from '@/lib/user-preferences';
import {
  applyDefaultPageToNew,
  pageForNewDocument,
  readDefaultPage,
  saveDefaultPage,
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

describe('readDefaultPage and saveDefaultPage', () => {
  it('reads none saved as none', () => {
    expect(readDefaultPage()).toBeNull();
  });

  it('keeps the sides, orientation, margins and colour, synced for the person, and reads them back', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tourSeen: true }));
    saveDefaultPage(
      { setup: { ...a5, columns: { count: 2, gap: 36 } }, pageless: false },
      'owner-1',
    );
    expect(readUserPreferences()).toEqual({ tourSeen: true, textDocumentPageSetup: a5 });
    expect(savePreferences).toHaveBeenCalled();
    expect(readDefaultPage()).toEqual({ setup: a5, pageless: false });
  });

  it('keeps pageless with the setup', () => {
    saveDefaultPage({ setup: a5, pageless: true }, null);
    expect(readUserPreferences().textDocumentPageSetup).toEqual({ ...a5, pageless: true });
    expect(readDefaultPage()).toEqual({ setup: a5, pageless: true });
  });

  it('ignores a kept setup that does not read back, and logs it', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ textDocumentPageSetup: { width: 'wide' } }),
    );
    expect(readDefaultPage()).toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[text-document] default page setup unreadable');
  });
});

describe('pageForNewDocument', () => {
  it('gives the person default setup, and pageless when theirs is', () => {
    expect(pageForNewDocument({ setup: a5, pageless: false }, 'en-US', 'odf')).toEqual({
      setup: a5,
    });
    expect(
      pageForNewDocument({ setup: PageSetup.of('letter'), pageless: true }, 'en-GB', 'odf'),
    ).toEqual({ pageless: true });
  });

  it('gives the locale paper when none is saved, and nothing where that is what a new document has', () => {
    expect(pageForNewDocument(null, 'en-GB', 'odf')).toEqual({ setup: PageSetup.of('a4') });
    expect(pageForNewDocument(null, 'en-US', 'odf')).toBeNull();
  });
});

describe('applyDefaultPageToNew', () => {
  it('sets a new document first section and pageless to the person default, never as an undo step', () => {
    saveDefaultPage({ setup: a5, pageless: true }, null);
    const doc = TextDocumentState.load();
    expect(applyDefaultPageToNew(doc, 'odf', 'en-US')).toBe(true);
    expect(TextDocumentState.section(doc, 'odf').setup).toEqual(a5);
    expect(TextDocumentState.pageless(doc)).toBe(true);
  });

  it('leaves a document whose page is already its own', () => {
    saveDefaultPage({ setup: a5, pageless: false }, null);
    const doc = TextDocumentState.load();
    TextDocumentState.setSection(doc, { start: 'next-page', setup: PageSetup.of('legal') });
    expect(applyDefaultPageToNew(doc, 'odf', 'en-US')).toBe(false);
    expect(TextDocumentState.section(doc, 'odf').setup).toEqual(PageSetup.of('legal'));
    const pageless = TextDocumentState.load();
    TextDocumentState.setPageless(pageless, true);
    expect(applyDefaultPageToNew(pageless, 'odf', 'en-US')).toBe(false);
  });

  it('writes nothing where the new document already has the page', () => {
    const doc = TextDocumentState.load();
    expect(applyDefaultPageToNew(doc, 'odf', 'en-US')).toBe(false);
    expect(TextDocumentState.metaType(doc).has('section')).toBe(false);
  });
});
