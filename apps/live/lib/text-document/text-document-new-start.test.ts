// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Default styles", page-layout.md "Page setup": a text document
// made in this browser tab starts in its maker's default styles and page setup the first time it opens, once, and
// only for a session that can edit it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageSetup, StyleLooks, TextDocumentState } from '@livedoc/text-documents';
import { saveDefaultStyles } from './text-document-default-styles';
import { noteTextDocumentMade } from './text-document-made';
import { saveDefaultPage } from './text-document-page-defaults';
import { startInMakersDefaults } from './text-document-new-start';

vi.mock('@/lib/preferences-sync', async (original) => ({
  ...(await original<typeof import('@/lib/preferences-sync')>()),
  savePreferences: vi.fn(),
}));

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const a5 = PageSetup.withPaper(PageSetup.of('letter'), 'a5');
const opened = (tabId = 't1', canEdit = true) => {
  const doc = TextDocumentState.load();
  return { doc, started: startInMakersDefaults(doc, { tabId, format: 'odf', canEdit }) };
};

describe('startInMakersDefaults', () => {
  it("starts a document made here in its maker's default styles and page setup, once", () => {
    saveDefaultStyles({ normal: { text: { font: 'Georgia' } } }, null);
    saveDefaultPage({ setup: a5, pageless: false }, null);
    noteTextDocumentMade('t1');
    const { doc, started } = opened();
    expect(started).toEqual({ styles: true, page: true });
    const styles = TextDocumentState.styles(doc, 'odf');
    expect(
      StyleLooks.of(styles, TextDocumentState.defaults(doc, 'odf'), 'Standard').text.font,
    ).toBe('Georgia');
    expect(TextDocumentState.section(doc, 'odf').setup).toEqual(a5);
    expect(opened().started).toEqual({ styles: false, page: false });
  });

  it('leaves a document not made here, or opened by a session that cannot edit', () => {
    saveDefaultPage({ setup: a5, pageless: false }, null);
    expect(opened('elsewhere').started).toEqual({ styles: false, page: false });
    noteTextDocumentMade('t2');
    const { doc, started } = opened('t2', false);
    expect(started).toEqual({ styles: false, page: false });
    expect(TextDocumentState.metaType(doc).has('section')).toBe(false);
  });
});
