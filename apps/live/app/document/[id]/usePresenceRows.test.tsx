// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Tab } from '@livedoc/document';
import type { Participant } from '@/lib/identity';
import { usePresenceRows } from './usePresenceRows';

const p = (id: string): Participant => ({ id, name: id, color: '#123456', status: 'online' });
const self = p('me');
const peer = p('peer');

const rows = (cursorsHidden: boolean) =>
  renderHook(() =>
    usePresenceRows({
      documentShareable: true,
      documentTeamId: null,
      activeId: 't1',
      selfParticipant: self,
      tabs: [{ id: 't1', elements: [] } as unknown as Tab],
      livePresence: [self, peer],
      liveAgents: [],
      presenceClock: { now: 1000, lastSeen: new Map([['peer', 1000]]) },
      remoteTabFocus: new Map([['peer', 't1']]),
      remoteCursors: new Map([['peer', { tabId: 't1', x: 10, y: 20 }]]),
      remoteSelections: new Map(),
      remoteLaserTrails: new Map([['peer', { tabId: 't1', points: [{ x: 1, y: 2, t: 1 }] }]]),
      remoteAvatars: new Map(),
      localLaserTrail: [{ x: 3, y: 4, t: 1 }],
      cursorsHidden,
    }),
  ).result.current;

// The hide-cursors vote (docs/specs/012-collaboration/session-tools.md) and presenting
// (docs/specs/012-collaboration/presentation-mode.md) both set cursorsHidden.
describe('usePresenceRows cursorsHidden', () => {
  it("shows a peer's cursor and laser normally", () => {
    const r = rows(false);
    expect(r.remoteCursorRows.map((c) => c.id)).toEqual(['peer']);
    expect(r.laserTrailRows).toHaveLength(2);
  });

  it("withholds a peer's cursor and laser but keeps our own laser", () => {
    const r = rows(true);
    expect(r.remoteCursorRows).toEqual([]);
    expect(r.laserTrailRows).toHaveLength(1);
    expect(r.laserTrailRows[0]?.points).toEqual([{ x: 3, y: 4, t: 1 }]);
  });
});

// docs/specs/008-canvas/canvas-performance.md "A release re-renders what moved, too": every element view reads who
// selects what, so presence arriving with no one selecting anything keeps the reading it had.
describe('usePresenceRows remoteSelectionsByElement', () => {
  const props = (
    livePresence: Participant[],
    remoteSelections: Map<string, { tabId: string; elementId: string | null }>,
  ) => ({
    documentShareable: true,
    documentTeamId: null,
    activeId: 't1',
    selfParticipant: self,
    tabs: [{ id: 't1', elements: [] } as unknown as Tab],
    livePresence,
    liveAgents: [],
    presenceClock: { now: 1000, lastSeen: new Map([['peer', 1000]]) },
    remoteTabFocus: new Map([['peer', 't1']]),
    remoteCursors: new Map(),
    remoteSelections,
    remoteLaserTrails: new Map(),
    remoteAvatars: new Map(),
    localLaserTrail: [],
    cursorsHidden: false,
  });

  it('keeps its reading while it says the same', () => {
    const hook = renderHook((p: ReturnType<typeof props>) => usePresenceRows(p), {
      initialProps: props([self], new Map()),
    });
    const before = hook.result.current.remoteSelectionsByElement;
    hook.rerender(props([self, peer], new Map()));
    expect(hook.result.current.remoteSelectionsByElement).toBe(before);
  });

  it('gives a new reading once a peer selects something', () => {
    const hook = renderHook((p: ReturnType<typeof props>) => usePresenceRows(p), {
      initialProps: props([self, peer], new Map()),
    });
    const before = hook.result.current.remoteSelectionsByElement;
    hook.rerender(props([self, peer], new Map([['peer', { tabId: 't1', elementId: 'e1' }]])));
    expect(hook.result.current.remoteSelectionsByElement).not.toBe(before);
    expect(hook.result.current.remoteSelectionsByElement.get('e1')?.map((s) => s.id)).toEqual([
      'peer',
    ]);
  });
});
