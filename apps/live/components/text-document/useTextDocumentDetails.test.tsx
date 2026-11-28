// @vitest-environment jsdom
// docs/specs/034-text-documents/files-and-print.md "Details": the shell's rows, then format, size, pages where laid
// out and the word count's; the last edit read from LiveDoc as it opens, the last save until then and where it cannot
// be; nothing read for This Browser; no Details without the shell's facts; the × hands the focus back.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import type { TextDocumentLastEditDto } from '@livedoc/api-schema';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import type { OfficeDocumentFacts } from '@/lib/office/office-details';
import { track } from '@/lib/telemetry';
import { DETAILS_ITEM, useTextDocumentDetails } from './useTextDocumentDetails';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/api/text-document-versions', () => ({
  apiReadTextDocumentLastEdit: vi.fn<() => Promise<TextDocumentLastEditDto | null>>(),
}));
const { apiReadTextDocumentLastEdit } = await import('@/lib/api/text-document-versions');

const s = textDocumentSchema;
const views: EditorView[] = [];
afterEach(() => {
  cleanup();
  for (const view of views.splice(0)) view.destroy();
  vi.clearAllMocks();
});

const AT = Date.UTC(2026, 10, 28, 11, 20);
const SAVED = Date.UTC(2026, 10, 28, 11, 30);
const EDITED = Date.UTC(2026, 10, 28, 11, 42);
const FACTS: OfficeDocumentFacts = {
  owner: { you: true },
  location: { place: 'mine', folders: ['Plans'] },
  createdAt: AT,
  savedAt: SAVED,
};

function setup({
  facts = FACTS,
  format = 'odf',
  pages = 3,
  local = false,
}: {
  facts?: OfficeDocumentFacts | null;
  format?: TextDocumentFormat;
  pages?: number | null;
  local?: boolean;
} = {}) {
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc: s.node('doc', null, [s.node('paragraph', null, [s.text('one two three')])]),
    }),
  });
  views.push(view);
  const doc = new Y.Doc();
  doc.getText('t').insert(0, 'x'.repeat(3000));
  const onDone = vi.fn<() => void>();
  let result: ReturnType<typeof useTextDocumentDetails> | null = null;
  function Harness() {
    result = useTextDocumentDetails({
      view,
      doc: { current: doc },
      facts,
      format,
      pages,
      where: { ownerId: 'me', documentId: 'd1', tabId: 't1', shareCode: null },
      local,
      onDone,
      when: { locale: 'en-GB', timeZone: 'UTC' },
    });
    return <>{result.dialog}</>;
  }
  render(<Harness />);
  const action = () => result!.actions[DETAILS_ITEM];
  const open = () => act(() => action()!.run());
  return { open, action, onDone };
}

const rows = () =>
  [...screen.getByRole('dialog', { name: 'Details' }).querySelectorAll('tr')].map((tr) => [
    tr.querySelector('th')!.textContent,
    tr.querySelector('td')!.textContent,
  ]);

describe('useTextDocumentDetails', () => {
  it('says the shell’s rows, then format, size, pages and the counts', async () => {
    vi.mocked(apiReadTextDocumentLastEdit).mockResolvedValueOnce(null);
    const { open } = setup();
    open();
    expect(rows()).toEqual([
      ['Owner', 'You'],
      ['Location', 'My Documents › Plans'],
      ['Created', '28 Nov 2026, 11:20'],
      ['Modified', '28 Nov 2026, 11:30'],
      ['Format', 'OpenDocument text (.odt)'],
      ['Size', expect.stringMatching(/^\d+(\.\d)? KB$/)],
      ['Pages', '3'],
      ['Words', '3'],
      ['Characters', '13'],
      ['Characters excluding spaces', '11'],
    ]);
    expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentDetails');
  });

  it('says the last edit LiveDoc recorded, with who made it', async () => {
    vi.mocked(apiReadTextDocumentLastEdit).mockResolvedValueOnce({
      at: EDITED,
      editor: { key: 'k', name: 'Ada', color: null },
    });
    const { open } = setup({ format: 'ooxml', pages: null });
    open();
    expect(await screen.findByText('28 Nov 2026, 11:42 by Ada')).toBeTruthy();
    expect(apiReadTextDocumentLastEdit).toHaveBeenCalledWith({
      ownerId: 'me',
      documentId: 'd1',
      tabId: 't1',
      shareCode: null,
    });
    expect(rows().map(([label]) => label)).not.toContain('Pages');
    expect(rows()).toContainEqual(['Format', 'Word document (.docx)']);
  });

  it('keeps the last save where the last edit cannot be read', async () => {
    vi.mocked(apiReadTextDocumentLastEdit).mockRejectedValueOnce(new Error('offline'));
    const { open } = setup();
    open();
    await act(async () => {});
    expect(rows()).toContainEqual(['Modified', '28 Nov 2026, 11:30']);
  });

  it('reads nothing from LiveDoc for a document in This Browser', async () => {
    const { open } = setup({ local: true });
    open();
    expect(apiReadTextDocumentLastEdit).not.toHaveBeenCalled();
  });

  it('offers no Details where the editor page hands no facts', () => {
    const { action } = setup({ facts: null });
    expect(action()).toBeUndefined();
  });

  it('closes with its × and hands the focus back to the writing', async () => {
    vi.mocked(apiReadTextDocumentLastEdit).mockResolvedValueOnce(null);
    const { open, onDone } = setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDone).toHaveBeenCalledOnce();
  });
});
