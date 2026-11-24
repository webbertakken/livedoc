// docs/specs/034-text-documents/links-and-navigation.md "Document tabs in the outline": the tab a link names, the next
// and previous tab, a new tab's name, and the ceiling on adding.
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { addLiveTab, TEXT_DOCUMENT_MAX_TABS, type DocumentTab } from '@livedoc/text-documents';
import {
  canAddTab,
  initialTab,
  newTabName,
  stepTab,
  tabAddress,
  tabOfSearch,
  textDocumentTabsStore,
} from './text-document-tabs';

const tab = (id: string, depth: 0 | 1 | 2 = 0): DocumentTab => ({ id, name: id, depth, body: [] });
const list = [tab('t.0'), tab('t.a', 1), tab('t.b')];

describe('text document tabs', () => {
  it('reads and writes the tab a link names as ?doctab=<id>, the editor’s hash kept', () => {
    expect(tabAddress('https://docs.nu/document/d1?s=c#t=x', 't.abc')).toBe(
      '/document/d1?s=c&doctab=t.abc#t=x',
    );
    expect(tabAddress('https://docs.nu/document/d1?doctab=t.0', 't.b')).toBe(
      '/document/d1?doctab=t.b',
    );
    expect(tabOfSearch('?s=c&doctab=t.abc')).toBe('t.abc');
    expect(tabOfSearch('?s=c')).toBeNull();
    expect(tabOfSearch('')).toBeNull();
  });

  it('opens on the tab the link names when it is listed, else on the first', () => {
    expect(initialTab(list, '?doctab=t.b')).toBe('t.b');
    expect(initialTab(list, '?doctab=t.gone')).toBe('t.0');
    expect(initialTab(list, '')).toBe('t.0');
  });

  it('steps to the next or previous tab in the outline’s order, nowhere at either end', () => {
    expect(stepTab(list, 't.0', 1)).toBe('t.a');
    expect(stepTab(list, 't.a', 1)).toBe('t.b');
    expect(stepTab(list, 't.b', 1)).toBeNull();
    expect(stepTab(list, 't.a', -1)).toBe('t.0');
    expect(stepTab(list, 't.0', -1)).toBeNull();
    expect(stepTab(list, 't.gone', 1)).toBeNull();
  });

  it('names a new tab Tab N, one more than the tabs there are', () => {
    expect(newTabName(list)).toBe('Tab 4');
  });

  it('adds no tab past the most a text document holds', () => {
    expect(canAddTab(list)).toBe(true);
    expect(canAddTab(Array.from({ length: TEXT_DOCUMENT_MAX_TABS }, (_, i) => tab(`t.${i}`)))).toBe(
      false,
    );
  });

  it('keeps the tab list as anyone changes it, read the same between changes', () => {
    const doc = new Y.Doc();
    const store = textDocumentTabsStore(doc);
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    const before = store.read();
    expect(before.map((t) => t.id)).toEqual(['t.0']);
    expect(store.read()).toBe(before);
    addLiveTab(doc, { id: 't.b', name: 'Tab 2', style: 'Standard' });
    expect(listener).toHaveBeenCalledOnce();
    expect(store.read().map((t) => t.name)).toEqual(['Tab 1', 'Tab 2']);
    stop();
    addLiveTab(doc, { id: 't.c', name: 'Tab 3', style: 'Standard' });
    expect(listener).toHaveBeenCalledOnce();
  });
});
