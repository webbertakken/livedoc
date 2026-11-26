// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "The dialog": Compare documents opens its dialog for everyone who reads the
// document, and is dimmed in This Browser with the reason.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import type * as Y from 'yjs';
import {
  COMPARE_DOCUMENTS,
  COMPARE_LOCAL_HINT,
  COMPARE_LOCAL_NOTE,
  useTextDocumentCompare,
} from './useTextDocumentCompare';

const liveDoc = { current: null as Y.Doc | null };
const props = {
  ownerId: 'me',
  documentId: 'doc',
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
});
