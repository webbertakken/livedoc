'use client';

// The name rides in the active tab (docs/specs/026-plan/plan-tabs.md "Its name in the active tab"): a Dashboard tab's
// name, and its rename, sit in the document group's active tab segment (DashboardMenuName portals them into this slot).
// The slot is a module store, like maximised-plan.ts.
import { useSyncExternalStore } from 'react';
import { createListeners } from '@/lib/listeners';

let slot: HTMLElement | null = null;
const listeners = createListeners();

// The menu box's slot mounting (an element) or going (null).
export function setMenuNameSlot(el: HTMLElement | null): void {
  if (el === slot) return;
  slot = el;
  listeners.notify();
}

const getSlot = () => slot;
const noSlot = () => null;
export function useMenuNameSlot(): HTMLElement | null {
  return useSyncExternalStore(listeners.subscribe, getSlot, noSlot);
}

// The slot in the document group's active tab segment, in the segment's ink, hidden while it holds nothing.
export function MenuNameSlot() {
  return (
    <span
      ref={setMenuNameSlot}
      data-menu-name-slot=""
      className="flex min-w-0 items-center gap-2 whitespace-nowrap empty:hidden"
    />
  );
}

// The name's look in the box: the chrome's text at regular weight (never bold), a little smaller than a header's,
// truncating.
export const IN_BOX_TITLE_CLASS = 'min-w-0 max-w-[16rem] truncate text-body font-normal';
