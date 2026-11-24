// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "The summary": read live from the metadata, anyone's write
// shown; an Editor writes it in place, Escape keeping the old; one write, counted; no one else writes it.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextDocumentState } from '@livedoc/text-documents';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const { useTextDocumentSummary } = await import('./useTextDocumentSummary');

afterEach(() => track.mockClear());

function setup({ canEdit = true } = {}) {
  const doc = TextDocumentState.load();
  const hook = renderHook(() =>
    useTextDocumentSummary({ liveDoc: { current: doc }, ready: true, canEdit }),
  );
  return { doc, hook };
}

describe('useTextDocumentSummary', () => {
  it('reads the summary as anyone writes it', () => {
    const { doc, hook } = setup();
    expect(hook.result.current.text).toBe('');
    act(() => {
      TextDocumentState.setSummary(doc, 'From someone else');
    });
    expect(hook.result.current.text).toBe('From someone else');
  });

  it('writes what was typed when the field is kept, counted once', () => {
    const { doc, hook } = setup();
    act(() => hook.result.current.edit());
    expect(hook.result.current.editing).toBe(true);
    act(() => hook.result.current.finish('  The plan, in short. '));
    expect(hook.result.current.editing).toBe(false);
    expect(TextDocumentState.summary(doc)).toBe('The plan, in short.');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Tab', 'Changed', 'TextDocumentSummary');
  });

  it('keeps the old text on Escape, and counts nothing unchanged', () => {
    const { doc, hook } = setup();
    act(() => {
      TextDocumentState.setSummary(doc, 'Kept');
    });
    act(() => hook.result.current.edit());
    act(() => hook.result.current.finish(null));
    act(() => hook.result.current.edit());
    act(() => hook.result.current.finish('Kept '));
    expect(TextDocumentState.summary(doc)).toBe('Kept');
    expect(track).not.toHaveBeenCalled();
  });

  it('lets no one but an Editor write it', () => {
    const { doc, hook } = setup({ canEdit: false });
    act(() => hook.result.current.edit());
    expect(hook.result.current.editing).toBe(false);
    act(() => hook.result.current.finish('Not mine'));
    expect(TextDocumentState.summary(doc)).toBe('');
  });
});
