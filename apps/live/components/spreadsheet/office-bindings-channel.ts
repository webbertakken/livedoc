'use client';

// How the open sheet's menu and toolbar bindings reach the title row above it (docs/specs/029-sheets/surface.md
// "Menu bar", "Toolbar"): the grid lives below the title row, inside the sheet's controller, and publishes what its
// items run and the active cell's font size here; the title row reads them. Subscribers hear only a change the shell
// would draw (ids, ticks, dimmed items, words, the size); a run always reaches the grid's latest binding, so a
// selection moved since never acts on the old one.
import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from 'react';
import type { OfficeAction } from '@/lib/office/office-catalogue';
import { bindingsSignature, type GridOffice } from '@/lib/spreadsheet/spreadsheet-menu-bindings';
import { debugLog } from '@/lib/debug-log';
import type { OfficeColours } from '@/components/office/OfficeColourControl';

export type { GridOffice };

export type OfficeBindingsChannel = {
  get: () => GridOffice;
  set: (next: GridOffice) => void;
  subscribe: (listener: () => void) => () => void;
};

export const NO_GRID_OFFICE: GridOffice = {
  actions: {},
  colours: null,
  recentCodes: [],
  fontSize: null,
  setFontSize: () => {},
};

// What the colour controls show now: each one's colour, so a change of the active cell's redraws them.
const coloursSignature = (colours: OfficeColours | null) =>
  colours
    ? Object.entries(colours)
        .map(([id, colour]) => `${id}=${String(colour.read())}`)
        .join(',')
    : '';

const signatureOf = (office: GridOffice) =>
  `${bindingsSignature(office.actions)}#${office.fontSize ?? ''}#${office.recentCodes.join('\n')}#${coloursSignature(office.colours)}`;

export function createOfficeBindingsChannel(): OfficeBindingsChannel {
  let latest: GridOffice = NO_GRID_OFFICE;
  let shown: GridOffice = NO_GRID_OFFICE;
  let signature = signatureOf(NO_GRID_OFFICE);
  const listeners = new Set<() => void>();
  // What the title row holds: each binding's look now, its run the latest one.
  const delegating = ({ actions, colours, recentCodes, fontSize }: GridOffice): GridOffice => ({
    actions: Object.fromEntries(
      Object.entries(actions).map(([id, action]): [string, OfficeAction] => [
        id,
        { ...action!, run: () => latest.actions[id]?.run() },
      ]),
    ),
    // A colour is read and set through the latest, as a run is.
    colours: colours
      ? Object.fromEntries(
          Object.entries(colours).map(([id, colour]) => [
            id,
            {
              ...colour,
              read: () => latest.colours?.[id]?.read(),
              set: (value: string | null) => latest.colours?.[id]?.set(value),
            },
          ]),
        )
      : null,
    recentCodes,
    fontSize,
    setFontSize: (pt) => latest.setFontSize(pt),
  });
  return {
    get: () => shown,
    set(next) {
      latest = next;
      const now = signatureOf(next);
      if (now === signature) return;
      signature = now;
      shown = next === NO_GRID_OFFICE ? next : delegating(next);
      debugLog('[spreadsheet] office bindings', { bound: Object.keys(next.actions).length });
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
export function usePublishedBindings(office: GridOffice): void {
  const channel = useContext(OfficeBindingsContext);
  useLayoutEffect(() => {
    channel?.set(office);
  });
  useLayoutEffect(() => () => channel?.set(NO_GRID_OFFICE), [channel]);
}

/** What the title row binds from the open sheet, redrawn when the shell would draw something else. */
export function useChannelBindings(channel: OfficeBindingsChannel): GridOffice {
  return useSyncExternalStore(channel.subscribe, channel.get, channel.get);
}
