'use client';

import { useSyncExternalStore } from 'react';

// The part of the page a person can actually see while it differs from the window (docs/specs/007-editor/
// live-app.md "A dialog stays above the on-screen keyboard"). A touch screen's keyboard shrinks the VISUAL
// viewport, not the layout one that `position: fixed` and `vh` measure against, so a modal centred in the window
// sat half under the keyboard. Null while the visible area is the whole window (no keyboard, no pinch zoom), so
// a desktop dialog keeps its own CSS placement untouched.

export type VisualViewportBand = { top: number; left: number; width: number; height: number };

// Below this (px) a difference between the visible area and the window is rounding, not a keyboard.
const VISUAL_VIEWPORT_SLACK_PX = 1;

// The visible band now, or null when it is the whole window (or there is no visualViewport to read).
export function readVisualViewportBand(): VisualViewportBand | null {
  if (typeof window === 'undefined') return null;
  const vv = window.visualViewport;
  if (!vv) return null;
  // The layout viewport: the root's client height is stable under iOS's keyboard, where innerHeight can follow
  // the visual viewport; jsdom reports 0 there, so the window's height stands in.
  const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
  const covered =
    layoutHeight - vv.height > VISUAL_VIEWPORT_SLACK_PX ||
    Math.abs(vv.offsetTop) > VISUAL_VIEWPORT_SLACK_PX;
  if (!covered) return null;
  return { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height };
}

const sameBand = (a: VisualViewportBand | null, b: VisualViewportBand | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height);

// The band, read once and kept, shared by every dialog: reading the viewport brings layout up to date, and a
// dialog reading it as it rendered laid out the whole board in the middle of a stroke's release
// (docs/specs/008-canvas/canvas-performance.md "A render never asks the browser for layout"). The viewport's
// events read it again (resize: the keyboard rising or falling; scroll: iOS panning the visible area across the
// page, which a drag with the keyboard up also does) and tell the dialogs when it changed; an unchanged
// viewport hands React the same object and renders nothing.
type WatchedBand = {
  // The visualViewport it was read through: one replaced (a test's stub) is read again.
  source: VisualViewport | undefined;
  band: VisualViewportBand | null;
  listeners: Set<() => void>;
};

let watched: WatchedBand | null = null;

function watch(): WatchedBand {
  const source = typeof window === 'undefined' ? undefined : (window.visualViewport ?? undefined);
  if (watched && watched.source === source) return watched;
  // Dialogs already listening move over to the new source.
  const entry: WatchedBand = {
    source,
    band: readVisualViewportBand(),
    listeners: watched?.listeners ?? new Set(),
  };
  if (source) {
    const update = () => {
      const next = readVisualViewportBand();
      if (sameBand(next, entry.band)) return;
      entry.band = next;
      for (const cb of entry.listeners) cb();
    };
    source.addEventListener('resize', update);
    source.addEventListener('scroll', update);
    window.addEventListener('resize', update);
  }
  watched = entry;
  return entry;
}

function subscribe(onChange: () => void): () => void {
  const { listeners } = watch();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

const snapshot = () => watch().band;

// Reads only on a viewport event: nothing runs per frame at rest, and nothing as a dialog renders.
export function useVisualViewportBand(): VisualViewportBand | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
