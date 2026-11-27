// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "The dialog": Compare documents opens its dialog for everyone who reads the
// document, and is dimmed in This Browser with the reason.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type * as Y from 'yjs';
import {
  COMPARE_DOCUMENTS,
  COMPARE_LOCAL_HINT,
  COMPARE_LOCAL_NOTE,
  useTextDocumentCompare,
} from './useTextDocumentCompare';

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/lib/api/text-document-versions', () => ({
  apiListTextDocumentVersions: api.list,
  apiReadTextDocumentVersion: vi.fn(),
}));

const liveDoc = { current: null as Y.Doc | null };
const props = {
  ownerId: 'me',
  documentId: 'doc',
  tabId: 't1',
  documentName: 'Mine',
  format: 'odf' as const,
  liveDoc,
  defaultName: 'Ada',
};

describe('useTextDocumentCompare', () => {
  it('opens the dialog from the Tools item', () => {
    const { result } = renderHook(() => useTextDocumentCompare({ ...props, local: false }));
    expect(result.current.dialog).toBeNull();
    act(() => result.current.actions[COMPARE_DOCUMENTS]!.run());
    expect(result.current.dialog).not.toBeNull();
  });

  it('refuses to compare before the writing is loaded', async () => {
    const { result } = renderHook(() => useTextDocumentCompare({ ...props, local: false }));
    act(() => result.current.actions[COMPARE_DOCUMENTS]!.run());
    const dialog = result.current.dialog as ReactElement<{
      onCompare: (choice: unknown) => Promise<unknown>;
    }>;
    await expect(
      dialog.props.onCompare({ selected: { id: 's', name: 'S' }, name: '', comments: false }),
    ).resolves.toEqual({ ok: false, refusal: 'unreadable' });
  });

  it('dims the item in This Browser, saying why', () => {
    const { result } = renderHook(() => useTextDocumentCompare({ ...props, local: true }));
    expect(result.current.actions[COMPARE_DOCUMENTS]).toMatchObject({
      disabled: true,
      note: COMPARE_LOCAL_NOTE,
      hint: COMPARE_LOCAL_HINT,
    });
    act(() => result.current.actions[COMPARE_DOCUMENTS]!.run());
    expect(result.current.dialog).toBeNull();
  });

  it("offers this document's versions to whoever sees version history, never in This Browser", async () => {
    type Shown = ReactElement<{ versions: (() => Promise<unknown>) | null }>;
    api.list.mockResolvedValue([]);
    const editor = renderHook(() =>
      useTextDocumentCompare({ ...props, local: false, versions: true }),
    );
    act(() => editor.result.current.actions[COMPARE_DOCUMENTS]!.run());
    const offered = (editor.result.current.dialog as Shown).props.versions;
    await offered!();
    expect(api.list).toHaveBeenCalledWith({
      ownerId: 'me',
      documentId: 'doc',
      tabId: 't1',
      shareCode: null,
    });
    const reader = renderHook(() => useTextDocumentCompare({ ...props, local: false }));
    act(() => reader.result.current.actions[COMPARE_DOCUMENTS]!.run());
    expect((reader.result.current.dialog as Shown).props.versions).toBeNull();
  });
});
