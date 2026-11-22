'use client';

// How the open sheet's menu bindings reach the title row above it (docs/specs/029-sheets/surface.md "Menu bar"): the
// grid lives below the title row, inside the sheet's controller, and publishes what its items run here; the title row
// reads them. Subscribers hear only a change the menus would draw (ids, ticks, dimmed items, words); a run always
// reaches the grid's latest binding, so a selection moved since never acts on the old one.
import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from 'react';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import { bindingsSignature } from '@/lib/spreadsheet/spreadsheet-menu-bindings';
import { debugLog } from '@/lib/debug-log';

export type OfficeBindingsChannel = {
  get: () => OfficeActions;
  set: (next: OfficeActions) => void;
  subscribe: (listener: () => void) => () => void;
};

const NONE: OfficeActions = {};

export function createOfficeBindingsChannel(): OfficeBindingsChannel {
  let latest: OfficeActions = NONE;
  let shown: OfficeActions = NONE;
  let signature = '';
  const listeners = new Set<() => void>();
  // What the title row holds: each binding's look now, its run the latest one.
  const delegating = (actions: OfficeActions): OfficeActions =>
    Object.fromEntries(
      Object.entries(actions).map(([id, action]): [string, OfficeAction] => [
        id,
        { ...action!, run: () => latest[id]?.run() },
      ]),
    );
  return {
    get: () => shown,
    set(next) {
      latest = next;
      const now = bindingsSignature(next);
      if (now === signature) return;
      signature = now;
      shown = delegating(next);
      debugLog('[spreadsheet] menu bindings', { bound: Object.keys(next).length });
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const OfficeBindingsContext = createContext<OfficeBindingsChannel | null>(null);

/** The open sheet's bindings, published on every render and cleared when it goes (nothing binds while none is open). */
export function usePublishedBindings(actions: OfficeActions): void {
  const channel = useContext(OfficeBindingsContext);
  useLayoutEffect(() => {
    channel?.set(actions);
  });
  useLayoutEffect(() => () => channel?.set(NONE), [channel]);
}

/** What the title row binds from the open sheet, redrawn when the menus would draw something else. */
export function useChannelBindings(channel: OfficeBindingsChannel): OfficeActions {
  return useSyncExternalStore(channel.subscribe, channel.get, channel.get);
}
