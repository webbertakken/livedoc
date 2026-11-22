// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomOutgoing } from '@livedoc/api-schema';
import {
  resetPdfPresenceForTests,
  setLocalPdfPresence,
  syncPdfPresencePeople,
  type PdfPlace,
} from '@/lib/pdf-document/pdf-presence-store';
import { BROADCAST_THROTTLE_MS } from './useEditorBroadcast';
import { usePdfPresenceBroadcast } from './usePdfPresenceBroadcast';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence": "Sent", "Whoever joins hears where everyone is".

const on = (page: string): PdfPlace => ({ page, mode: 'reviewing', held: null });
const op = (tabId: string, page: string | null) =>
  page === null
    ? { kind: 'op', op: { kind: 'pdf-presence', tabId, page: null } }
    : { kind: 'op', op: { kind: 'pdf-presence', tabId, ...on(page) } };

let sent: RoomOutgoing[] = [];
const roomRef = { current: { send: (msg: RoomOutgoing) => void sent.push(msg) } };
const broadcast = (props: { live: boolean; hidden: boolean }) =>
  renderHook(
    (p: { live: boolean; hidden: boolean }) => usePdfPresenceBroadcast({ roomRef, ...p }),
    {
      initialProps: props,
    },
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  resetPdfPresenceForTests();
  sent = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePdfPresenceBroadcast', () => {
  it('sends the place the surface publishes, with the tab', () => {
    broadcast({ live: true, hidden: false });
    expect(sent).toEqual([]);
    setLocalPdfPresence('t1', on('p:3'));
    expect(sent).toEqual([op('t1', 'p:3')]);
  });

  it('sends at the cursor’s rate, the last place always following', () => {
    broadcast({ live: true, hidden: false });
    setLocalPdfPresence('t1', on('p:1'));
    setLocalPdfPresence('t1', on('p:2'));
    setLocalPdfPresence('t1', on('p:3'));
    expect(sent).toEqual([op('t1', 'p:1')]);
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    expect(sent).toEqual([op('t1', 'p:1'), op('t1', 'p:3')]);
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    setLocalPdfPresence('t1', on('p:4'));
    expect(sent).toHaveLength(3);
  });

  it('shows a place already held when the room opens', () => {
    setLocalPdfPresence('t1', on('p:3'));
    const hook = broadcast({ live: false, hidden: false });
    expect(sent).toEqual([]);
    hook.rerender({ live: true, hidden: false });
    expect(sent).toEqual([op('t1', 'p:3')]);
  });

  it('takes the place back when the person leaves the tab', () => {
    broadcast({ live: true, hidden: false });
    setLocalPdfPresence('t1', on('p:3'));
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    setLocalPdfPresence('t1', null);
    expect(sent).toEqual([op('t1', 'p:3'), op('t1', null)]);
    // Nothing was shown since: nothing more to take back.
    setLocalPdfPresence('t1', null);
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    expect(sent).toHaveLength(2);
  });

  it('takes it back within the rate when the person left a moment after moving', () => {
    broadcast({ live: true, hidden: false });
    setLocalPdfPresence('t1', on('p:3'));
    setLocalPdfPresence('t1', null);
    expect(sent).toEqual([op('t1', 'p:3')]);
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    expect(sent).toEqual([op('t1', 'p:3'), op('t1', null)]);
  });

  it('follows the person to another PDF tab', () => {
    broadcast({ live: true, hidden: false });
    setLocalPdfPresence('t1', on('p:3'));
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    setLocalPdfPresence('t2', on('p:8'));
    expect(sent.at(-1)).toEqual(op('t2', 'p:8'));
  });

  // "None go out while a hide-cursors vote is open, and a place already shown is taken back."
  it('sends none while a hide-cursors vote is open, takes back what was shown, and shows it again after', () => {
    const hook = broadcast({ live: true, hidden: false });
    setLocalPdfPresence('t1', on('p:3'));
    hook.rerender({ live: true, hidden: true });
    expect(sent).toEqual([op('t1', 'p:3'), op('t1', null)]);
    setLocalPdfPresence('t1', on('p:4'));
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS * 2);
    expect(sent).toHaveLength(2);
    hook.rerender({ live: true, hidden: false });
    expect(sent.at(-1)).toEqual(op('t1', 'p:4'));
  });

  it('takes the place back when the room closes or the editor goes', () => {
    const hook = broadcast({ live: true, hidden: false });
    setLocalPdfPresence('t1', on('p:3'));
    hook.unmount();
    expect(sent).toEqual([op('t1', 'p:3'), op('t1', null)]);
    setLocalPdfPresence('t1', on('p:5'));
    expect(sent).toHaveLength(2);
  });

  it('drops a send that was waiting when the room closes', () => {
    const hook = broadcast({ live: true, hidden: false });
    setLocalPdfPresence('t1', on('p:1'));
    setLocalPdfPresence('t1', on('p:2'));
    hook.rerender({ live: false, hidden: false });
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS * 2);
    expect(sent).toEqual([op('t1', 'p:1'), op('t1', null)]);
  });

  // "each person says their place again when someone joins".
  it('says the place again when someone joins, and nothing where there is none', () => {
    broadcast({ live: true, hidden: false });
    syncPdfPresencePeople([{ id: 'a', name: 'Ada', color: '#f00' }]);
    expect(sent).toEqual([]);
    setLocalPdfPresence('t1', on('p:3'));
    vi.advanceTimersByTime(BROADCAST_THROTTLE_MS);
    syncPdfPresencePeople([
      { id: 'a', name: 'Ada', color: '#f00' },
      { id: 'b', name: 'Bob', color: '#0f0' },
    ]);
    expect(sent).toEqual([op('t1', 'p:3'), op('t1', 'p:3')]);
  });

  it('sends nothing when the room is gone from under it', () => {
    const gone = { current: null };
    renderHook(() => usePdfPresenceBroadcast({ roomRef: gone, live: true, hidden: false }));
    expect(() => setLocalPdfPresence('t1', on('p:3'))).not.toThrow();
  });
});
