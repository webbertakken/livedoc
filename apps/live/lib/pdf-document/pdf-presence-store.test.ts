// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalPdfPresence,
  pdfPresencePeersOf,
  receivePdfPresence,
  resetPdfPresenceForTests,
  resetPdfPresencePeers,
  setLocalPdfPresence,
  subscribeLocalPdfPresence,
  syncPdfPresencePeople,
  usePdfPresencePeers,
  type PdfPlace,
} from './pdf-presence-store';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence".

const ADA = { id: 'a', name: 'Ada', color: '#f00' };
const BOB = { id: 'b', name: 'Bob', color: '#0f0' };
const on = (page: string, more: Partial<PdfPlace> = {}): PdfPlace => ({
  page,
  mode: 'reviewing',
  held: null,
  ...more,
});

beforeEach(resetPdfPresenceForTests);

describe('our place', () => {
  it('is the page in view, the mode and what is held, on one tab', () => {
    const heard = vi.fn();
    subscribeLocalPdfPresence(heard);
    setLocalPdfPresence('t1', on('p:3'));
    expect(getLocalPdfPresence()).toEqual({ tabId: 't1', ...on('p:3') });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('tells its listeners only when it moved: a page, a mode, a thing held, a tab', () => {
    const heard = vi.fn();
    const stop = subscribeLocalPdfPresence(heard);
    setLocalPdfPresence('t1', on('p:3'));
    setLocalPdfPresence('t1', on('p:3'));
    expect(heard).toHaveBeenCalledTimes(1);
    setLocalPdfPresence('t1', on('p:4'));
    setLocalPdfPresence('t1', on('p:4', { mode: 'viewing' }));
    setLocalPdfPresence('t1', on('p:4', { mode: 'viewing', held: { what: 'mark', name: 'm1' } }));
    setLocalPdfPresence('t1', on('p:4', { mode: 'viewing', held: { what: 'mark', name: 'm1' } }));
    setLocalPdfPresence('t2', on('p:4', { mode: 'viewing', held: { what: 'mark', name: 'm1' } }));
    expect(heard).toHaveBeenCalledTimes(5);
    stop();
    setLocalPdfPresence('t2', on('p:9'));
    expect(heard).toHaveBeenCalledTimes(5);
  });

  it('is gone when its own tab lets it go, never when another tab does', () => {
    const heard = vi.fn();
    setLocalPdfPresence('t1', on('p:3'));
    subscribeLocalPdfPresence(heard);
    setLocalPdfPresence('t2', null);
    expect(getLocalPdfPresence()?.tabId).toBe('t1');
    expect(heard).not.toHaveBeenCalled();
    setLocalPdfPresence('t1', null);
    expect(getLocalPdfPresence()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("collaborators' places", () => {
  it('are kept by tab, named and coloured from the presence list', () => {
    syncPdfPresencePeople([ADA, BOB]);
    receivePdfPresence('a', { tabId: 't1', ...on('p:3') });
    receivePdfPresence('b', { tabId: 't1', ...on('n:x', { mode: 'viewing' }) });
    expect(pdfPresencePeersOf('t1')).toEqual([
      { ...ADA, place: on('p:3') },
      { ...BOB, place: on('n:x', { mode: 'viewing' }) },
    ]);
    expect(pdfPresencePeersOf('t2')).toEqual([]);
  });

  it('go when a person leaves the tab, leaves the room, or the room closes', () => {
    syncPdfPresencePeople([ADA, BOB]);
    receivePdfPresence('a', { tabId: 't1', ...on('p:3') });
    receivePdfPresence('b', { tabId: 't1', ...on('p:4') });
    receivePdfPresence('a', { tabId: 't1', page: null });
    expect(pdfPresencePeersOf('t1').map((peer) => peer.id)).toEqual(['b']);
    syncPdfPresencePeople([ADA]);
    expect(pdfPresencePeersOf('t1')).toEqual([]);
    receivePdfPresence('a', { tabId: 't1', ...on('p:3') });
    resetPdfPresencePeers();
    expect(pdfPresencePeersOf('t1')).toEqual([]);
  });

  it('redraw the surface that reads them', () => {
    syncPdfPresencePeople([ADA]);
    const { result } = renderHook(() => usePdfPresencePeers('t1'));
    expect(result.current).toEqual([]);
    act(() => receivePdfPresence('a', { tabId: 't1', ...on('p:3') }));
    expect(result.current).toEqual([{ ...ADA, place: on('p:3') }]);
  });
});

// "Whoever joins hears where everyone is": the room keeps no presence.
describe('a join', () => {
  it('has our place said again, to whoever sends it', () => {
    syncPdfPresencePeople([ADA]);
    setLocalPdfPresence('t1', on('p:3'));
    const heard = vi.fn();
    subscribeLocalPdfPresence(heard);
    syncPdfPresencePeople([ADA]);
    expect(heard).not.toHaveBeenCalled();
    syncPdfPresencePeople([ADA, BOB]);
    expect(heard).toHaveBeenCalledTimes(1);
    // The connection returned: the room closed, and its list arrives again.
    resetPdfPresencePeers();
    syncPdfPresencePeople([ADA, BOB]);
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
