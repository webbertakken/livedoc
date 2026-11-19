// docs/specs/034-text-documents/live-editing-and-storage.md "Presence": collaborators' carets, named for a moment after
// they move, drawn per tab, gone with whoever leaves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalTextDocumentCaret,
  receiveTextDocumentCaret,
  resetTextDocumentCaretsForTests,
  setLocalTextDocumentCaret,
  subscribeLocalTextDocumentCaret,
  syncTextDocumentPeople,
  TEXT_DOCUMENT_CARET_FRESH_MS,
  textDocumentPeersOf,
} from './text-document-carets-store';

const ana = { id: 'p1', name: 'Ana', color: '#1a73e8' };

beforeEach(() => {
  vi.useFakeTimers();
  resetTextDocumentCaretsForTests();
});
afterEach(() => vi.useRealTimers());

describe('our caret', () => {
  it('tells its listeners when it moves or leaves, never for the same place', () => {
    const heard = vi.fn();
    const off = subscribeLocalTextDocumentCaret(heard);
    setLocalTextDocumentCaret('t', { anchor: 'AQ==', head: 'AQ==' });
    setLocalTextDocumentCaret('t', { anchor: 'AQ==', head: 'AQ==' });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(getLocalTextDocumentCaret()).toEqual({ tabId: 't', anchor: 'AQ==', head: 'AQ==' });
    setLocalTextDocumentCaret('other', null);
    expect(getLocalTextDocumentCaret()).not.toBeNull();
    setLocalTextDocumentCaret('t', null);
    expect(getLocalTextDocumentCaret()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    off();
  });
});

describe("collaborators' carets", () => {
  it('draws a known person on their tab, named while fresh', () => {
    syncTextDocumentPeople([ana]);
    receiveTextDocumentCaret('p1', { tabId: 't', anchor: 'AQ==', head: 'Ag==' });
    expect(textDocumentPeersOf('t')).toEqual([
      { ...ana, anchor: 'AQ==', head: 'Ag==', fresh: true },
    ]);
    expect(textDocumentPeersOf('other')).toEqual([]);
    vi.advanceTimersByTime(TEXT_DOCUMENT_CARET_FRESH_MS);
    expect(textDocumentPeersOf('t')[0]?.fresh).toBe(false);
  });

  it('draws nobody the room has not named, and drops whoever leaves the writing or the room', () => {
    receiveTextDocumentCaret('p1', { tabId: 't', anchor: 'AQ==', head: 'AQ==' });
    expect(textDocumentPeersOf('t')).toEqual([]);
    syncTextDocumentPeople([ana]);
    expect(textDocumentPeersOf('t')).toHaveLength(1);
    receiveTextDocumentCaret('p1', { tabId: 't', anchor: null });
    expect(textDocumentPeersOf('t')).toEqual([]);
    receiveTextDocumentCaret('p1', { tabId: 't', anchor: 'AQ==', head: 'AQ==' });
    syncTextDocumentPeople([]);
    expect(textDocumentPeersOf('t')).toEqual([]);
  });
});
