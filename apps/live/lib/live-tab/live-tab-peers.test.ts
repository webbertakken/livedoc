import { describe, expect, it, vi } from 'vitest';
import { liveTabPeers } from './live-tab-peers';

// docs/specs/006-document/kinds-outside-the-canvas.md "Live state": who is where on a live tab, for the kind's surface.

const ADA = { id: 'a', name: 'Ada', color: '#f00' };
const BOB = { id: 'b', name: 'Bob', color: '#0f0' };
const peers = (onJoined?: () => void) =>
  liveTabPeers<number>({ same: (a, b) => a === b, ...(onJoined ? { onJoined } : {}) });

describe('liveTabPeers', () => {
  it('lists the collaborators on a tab with their places, names and colours', () => {
    const store = peers();
    store.syncPeople([ADA, BOB]);
    store.receive('a', 't1', 3);
    store.receive('b', 't2', 9);
    expect(store.of('t1')).toEqual([{ ...ADA, place: 3 }]);
    expect(store.of('t2')).toEqual([{ ...BOB, place: 9 }]);
    expect(store.of('t3')).toEqual([]);
  });

  it('shows nobody the presence list does not name, until it does', () => {
    const store = peers();
    store.receive('a', 't1', 3);
    expect(store.of('t1')).toEqual([]);
    store.syncPeople([ADA]);
    expect(store.of('t1')).toEqual([{ ...ADA, place: 3 }]);
  });

  it('answers the same list until someone on it changes, and tells its listeners when one does', () => {
    const store = peers();
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    store.syncPeople([ADA]);
    store.receive('a', 't1', 3);
    expect(heard).toHaveBeenCalledTimes(1);
    const first = store.of('t1');
    store.receive('a', 't1', 3);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(store.of('t1')).toBe(first);
    expect(store.of('t9')).toBe(store.of('t8'));
    store.receive('a', 't1', 4);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(store.of('t1')).toEqual([{ ...ADA, place: 4 }]);
    store.receive('a', 't2', 4);
    expect(store.of('t1')).toEqual([]);
    stop();
    store.receive('a', 't2', 5);
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it('follows a new name or colour', () => {
    const store = peers();
    const heard = vi.fn();
    store.subscribe(heard);
    store.syncPeople([ADA, BOB]);
    store.receive('a', 't1', 3);
    heard.mockClear();
    store.syncPeople([
      { ...ADA, name: 'Ada L.' },
      { ...BOB, color: '#00f' },
    ]);
    expect(store.of('t1')).toEqual([{ ...ADA, name: 'Ada L.', place: 3 }]);
    // Bob is nowhere, so his new colour redraws nothing; Ada's name does, once.
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('lets a place go when its person leaves the tab, or the room', () => {
    const store = peers();
    const heard = vi.fn();
    store.syncPeople([ADA, BOB]);
    store.receive('a', 't1', 3);
    store.receive('b', 't1', 4);
    store.subscribe(heard);
    store.forget('a');
    store.forget('a');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(store.of('t1')).toEqual([{ ...BOB, place: 4 }]);
    store.syncPeople([ADA]);
    expect(store.of('t1')).toEqual([]);
    expect(heard).toHaveBeenCalledTimes(2);
    // Gone from the list is gone by name too: a place heard later waits for the list again.
    store.receive('b', 't1', 5);
    expect(store.of('t1')).toEqual([]);
  });

  it('forgets everyone when the room closes', () => {
    const store = peers();
    store.syncPeople([ADA]);
    store.receive('a', 't1', 3);
    store.reset();
    expect(store.of('t1')).toEqual([]);
    store.receive('a', 't1', 3);
    expect(store.of('t1')).toEqual([]);
  });

  it('says when someone joined, once a join, never for a list that only shrank or stayed', () => {
    const onJoined = vi.fn();
    const store = peers(onJoined);
    store.syncPeople([ADA]);
    expect(onJoined).toHaveBeenCalledTimes(1);
    store.syncPeople([ADA]);
    store.syncPeople([{ ...ADA, name: 'Ada L.' }]);
    expect(onJoined).toHaveBeenCalledTimes(1);
    store.syncPeople([ADA, BOB]);
    expect(onJoined).toHaveBeenCalledTimes(2);
    store.syncPeople([BOB]);
    expect(onJoined).toHaveBeenCalledTimes(2);
    // Whoever returns has joined again; after the room closed, everyone has.
    store.syncPeople([ADA, BOB]);
    expect(onJoined).toHaveBeenCalledTimes(3);
    store.reset();
    store.syncPeople([ADA, BOB]);
    expect(onJoined).toHaveBeenCalledTimes(4);
  });
});
