'use client';

import { useCallback, useState, type RefObject } from 'react';
import { useLatest } from '@/hooks/ui/useLatest';
import type { Selection } from '@/lib/selection-store';
import { StepSelections } from '@/lib/step-selection';
import { graftLiveTabState, type Tab } from '@livedoc/document';
import {
  EMPTY_REPLAY,
  catchUp,
  compactReplay,
  pruneReplay,
  replayHead,
  type RemoteApply,
  type Replay,
} from './history-replay';

// Bounded undo/redo over the tabs array. See docs/specs/008-canvas/canvas-and-palette.md ("Undo / Redo").
//
// Three primitives:
//   commit(mapTabs)         — push current to past, replace present, clear future
//   tick(mapTabs)            — update present only (no history change; for drags)
//   markCheckpoint()         — push current to past without changing present
//                              (use at drag start so undo returns to pre-drag state)
//
// All keep the past stack capped to HISTORY_LIMIT.

// Steps kept in each direction, on every device. Snapshots share unchanged tabs and elements, so a
// step costs about one pointer per element of the changed tab: 500 steps on a 2,000-element board
// measured ~8 MB of heap. Safe range: 1 to ~2,000.
export const HISTORY_LIMIT = 500;

export type History = {
  past: Tab[][];
  present: Tab[];
  future: Tab[][];
  // How many steps lie behind the present, uncapped (the cap drops the oldest snapshots, never
  // this count), and which branch of edits the present is on (raised by every new step, which
  // clears redo). Item undo steps sit between snapshots by these two counters
  // (docs/specs/026-plan/items.md "Undo"; useItemUndo). Absent = 0.
  depth?: number;
  branch?: number;
  // The peer ops the snapshots have yet to take, and each snapshot's stamp in it, side by side with
  // `past` and `future` (history-replay.ts). Absent = nothing pending: every snapshot is current.
  replay?: Replay;
  pastAt?: number[];
  futureAt?: number[];
  // The selection each step was made with, and the one undo left behind it, by depth (lib/step-selection):
  // undo and redo bring them back (docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo"). Absent = none.
  selections?: StepSelections;
};

const depthOf = (h: History) => h.depth ?? 0;
const branchOf = (h: History) => h.branch ?? 0;
const replayOf = (h: History) => h.replay ?? EMPTY_REPLAY;
const pastAtOf = (h: History) => h.pastAt ?? h.past.map(() => replayHead(replayOf(h)));
const futureAtOf = (h: History) => h.futureAt ?? h.future.map(() => replayHead(replayOf(h)));

// The stacks as given, with the replay log trimmed to what their snapshots still lack.
function withStacks(
  h: History,
  stacks: Pick<History, 'past' | 'future'> & { pastAt: number[]; futureAt: number[] },
): Pick<History, 'past' | 'future' | 'pastAt' | 'futureAt' | 'replay'> {
  const replay = pruneReplay(replayOf(h), [...stacks.pastAt, ...stacks.futureAt]);
  return { ...stacks, replay };
}

// Pure transitions on a History value — exported for unit tests.
// The hook wraps them with `setHistory((h) => transition(h, ...))`.

/** True when two objects hold the same values one level down: what a setter that rebuilt an object without
 *  changing anything leaves behind. */
function sameFields(a: object, b: object): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

/** True when `next` changes nothing in `prev`: every tab is the same one, or holds the same fields and the same
 *  elements. A setter maps a fresh array and object even when it writes the value already there (a size box
 *  committed on Enter and again on blur), and that must not become an undo step. Linear in the elements of a
 *  tab the setter touched; untouched tabs and elements match by reference. */
export function sameTabs(prev: Tab[], next: Tab[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  return prev.every((tab, i) => {
    const other = next[i]!;
    if (tab === other) return true;
    const { elements, ...rest } = tab;
    const { elements: otherElements, ...otherRest } = other;
    if (!sameFields(rest, otherRest)) return false;
    if (elements === otherElements) return true;
    if (elements.length !== otherElements.length) return false;
    return elements.every((el, j) => el === otherElements[j] || sameFields(el, otherElements[j]!));
  });
}

export function historyCommit(
  h: History,
  mapTabs: (tabs: Tab[]) => Tab[],
  selection?: Selection,
): History {
  const present = mapTabs(h.present);
  // A commit that changes nothing is not a step (docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo"):
  // pushing it made Undo appear to do nothing and cleared the redo stack.
  if (sameTabs(h.present, present)) return h;
  return withStepSelection(
    {
      ...pushPast(h),
      ...keptSelections(h),
      present,
      depth: depthOf(h) + 1,
      branch: branchOf(h) + 1,
    },
    selection,
  );
}

// The selections the steps keep, carried over a transition that rebuilds the history.
const keptSelections = (h: History): Pick<History, 'selections'> =>
  h.selections ? { selections: h.selections } : {};

// A new step, made while `selection` was selected: what its undo brings back.
function withStepSelection(h: History, selection: Selection | undefined): History {
  if (!selection) return h;
  return {
    ...h,
    selections: StepSelections.record(
      h.selections ?? StepSelections.empty(),
      depthOf(h),
      selection,
    ),
  };
}

/** The selection undo brings back: the one the newest step was made with, or null when it kept none. */
export function historyUndoSelection(h: History): Selection | null {
  return h.past.length > 0 && h.selections
    ? StepSelections.forUndo(h.selections, depthOf(h))
    : null;
}

/** The selection redo brings back: the one undo left behind the next step, or null when it kept none. */
export function historyRedoSelection(h: History): Selection | null {
  return h.future.length > 0 && h.selections
    ? StepSelections.forRedo(h.selections, depthOf(h) + 1)
    : null;
}

// The present onto the undo stack, stamped current, and the redo stack cleared.
function pushPast(h: History) {
  return withStacks(h, {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    pastAt: [...pastAtOf(h), replayHead(replayOf(h))].slice(-HISTORY_LIMIT),
    future: [],
    futureAt: [],
  });
}

export function historyTick(h: History, mapTabs: (tabs: Tab[]) => Tab[]): History {
  return { ...h, present: mapTabs(h.present) };
}

export function historyMarkCheckpoint(h: History, selection?: Selection): History {
  return withStepSelection(
    {
      ...pushPast(h),
      ...keptSelections(h),
      present: h.present,
      depth: depthOf(h) + 1,
      branch: branchOf(h) + 1,
    },
    selection,
  );
}

// A new step that is not a snapshot (an item change, useItemUndo): the redo side is gone.
function historyClearRedo(h: History): History {
  return {
    ...h,
    ...withStacks(h, { past: h.past, pastAt: pastAtOf(h), future: [], futureAt: [] }),
    branch: branchOf(h) + 1,
  };
}

// The newest undo snapshot, with the peer ops it lacks.
const newestPast = (h: History): Tab[] =>
  catchUp(h.past[h.past.length - 1]!, pastAtOf(h)[h.past.length - 1]!, replayOf(h));

// Undo / redo re-graft the LIVE non-undoable state onto the restored
// snapshot: comment threads (docs/specs/008-canvas/canvas-and-palette.md — typing a comment then Ctrl+Z
// mustn't wipe it) AND the session tools' `timer` / `vote` tab fields
// (docs/specs/012-collaboration/session-tools.md — not undoable, mutated via tick so no snapshot ever holds
// them). Restoring a snapshot verbatim silently dropped both (then
// autosave persisted + broadcast the stripped tab to every peer).

export function historyUndo(h: History, leaving?: Selection): History {
  if (h.past.length === 0) return h;
  return {
    ...(leaving && h.selections
      ? { selections: StepSelections.leftByUndo(h.selections, depthOf(h), leaving) }
      : keptSelections(h)),
    ...withStacks(h, {
      past: h.past.slice(0, -1),
      pastAt: pastAtOf(h).slice(0, -1),
      future: [h.present, ...h.future].slice(0, HISTORY_LIMIT),
      futureAt: [replayHead(replayOf(h)), ...futureAtOf(h)].slice(0, HISTORY_LIMIT),
    }),
    present: graftLiveTabState(h.present, newestPast(h)),
    depth: depthOf(h) - 1,
    branch: branchOf(h),
  };
}

// Abort an in-flight gesture: restore the newest snapshot (the
// checkpoint its first mutation pushed) into the present and DISCARD
// that step — unlike undo, nothing lands on the redo side, because a
// cancelled drag never happened. Live comment/session state grafts on
// exactly as undo does.
export function historyCancel(h: History): History {
  if (h.past.length === 0) return h;
  return {
    ...keptSelections(h),
    ...withStacks(h, {
      past: h.past.slice(0, -1),
      pastAt: pastAtOf(h).slice(0, -1),
      future: h.future,
      futureAt: futureAtOf(h),
    }),
    present: graftLiveTabState(h.present, newestPast(h)),
    depth: depthOf(h) - 1,
    branch: branchOf(h),
  };
}

export function historyRedo(h: History): History {
  if (h.future.length === 0) return h;
  const next = catchUp(h.future[0]!, futureAtOf(h)[0]!, replayOf(h));
  return {
    ...keptSelections(h),
    ...withStacks(h, {
      past: [...h.past, h.present].slice(-HISTORY_LIMIT),
      pastAt: [...pastAtOf(h), replayHead(replayOf(h))].slice(-HISTORY_LIMIT),
      future: h.future.slice(1),
      futureAt: futureAtOf(h).slice(1),
    }),
    present: graftLiveTabState(h.present, next),
    depth: depthOf(h) + 1,
    branch: branchOf(h),
  };
}

export function historyReset(h: History, tabs: Tab[] | ((prev: Tab[]) => Tab[])): History {
  const next = typeof tabs === 'function' ? tabs(h.present) : tabs;
  return { past: [], present: next, future: [], depth: 0, branch: branchOf(h) + 1 };
}

// Replace the present with content from elsewhere (a resync's fetched tabs, a Q&A board's own
// write) WITHOUT touching the undo / redo stacks. A peer's op goes through historyApplyRemoteOp
// instead, so undo never brings back what a peer changed.
export function historyApplyRemote(h: History, tabs: Tab[] | ((prev: Tab[]) => Tab[])): History {
  const next = typeof tabs === 'function' ? tabs(h.present) : tabs;
  return { ...h, present: next };
}

// A peer's (or an agent's) op, applied to the present now AND to every undo and redo snapshot when
// undo, redo or a cancel restores it (docs/specs/012-collaboration/realtime-conflict-resolution.md
// "Undo"; history-replay.ts): undo then restores the person's own earlier state with the peer's
// change still in it, so it takes back only their own edits, never a collaborator's (a peer's
// element, a tab they added). `apply` is the pure op (applyRoomOpToTabs), returning its input when
// the op changes nothing there; with no snapshot to replay it onto, such an op leaves the history
// itself, so nothing re-renders for it.
export function historyApplyRemoteOp(h: History, apply: RemoteApply): History {
  const present = apply(h.present, false);
  if (h.past.length === 0 && h.future.length === 0) {
    return present === h.present ? h : { ...h, present, replay: undefined };
  }
  const log = replayOf(h);
  const appended: Replay = { first: log.first, ops: [...log.ops, apply] };
  const { tabs, stamps, replay } = compactReplay(
    { tabs: [...h.past, ...h.future], stamps: [...pastAtOf(h), ...futureAtOf(h)] },
    appended,
  );
  const split = h.past.length;
  return {
    ...h,
    present,
    past: tabs.slice(0, split),
    future: tabs.slice(split),
    pastAt: stamps.slice(0, split),
    futureAt: stamps.slice(split),
    replay,
  };
}

type DocumentHistory = {
  tabs: Tab[];
  canUndo: boolean;
  canRedo: boolean;
  commit: (mapTabs: (tabs: Tab[]) => Tab[]) => void;
  tick: (mapTabs: (tabs: Tab[]) => Tab[]) => void;
  markCheckpoint: () => void;
  cancelToCheckpoint: () => void;
  reset: (tabs: Tab[] | ((prev: Tab[]) => Tab[])) => void;
  applyRemote: (tabs: Tab[] | ((prev: Tab[]) => Tab[])) => void;
  // A peer's op, into the present and every undo / redo snapshot (historyApplyRemoteOp).
  applyRemoteOp: (apply: RemoteApply) => void;
  // Each returns the selection the step it took kept (null when none): the caller brings it back once the tabs are in.
  undo: () => Selection | null;
  redo: () => Selection | null;
  // The counters item undo steps are placed by (useItemUndo).
  depth: number;
  branch: number;
  futureLength: number;
  clearRedo: () => void;
};

// `readSelection`: this person's selection now, read as each step is made and undone, so undo and redo can bring
// it back (docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo"). A ref, as the selection comes after the history.
export function useDocumentHistory(
  initialTabs: Tab[],
  readSelection?: RefObject<(() => Selection) | null>,
): DocumentHistory {
  const [history, setHistory] = useState<History>({
    past: [],
    present: initialTabs,
    future: [],
  });
  const historyRef = useLatest(history);
  const selectionNow = () => readSelection?.current?.() ?? undefined;

  const commit = (mapTabs: (tabs: Tab[]) => Tab[]) => {
    const selection = selectionNow();
    setHistory((h) => historyCommit(h, mapTabs, selection));
  };

  // Stable identity: the delta sender (useElementDeltas) memoises on it.
  const tick = useCallback((mapTabs: (tabs: Tab[]) => Tab[]) => {
    setHistory((h) => historyTick(h, mapTabs));
  }, []);

  const markCheckpoint = () => {
    const selection = selectionNow();
    setHistory((h) => historyMarkCheckpoint(h, selection));
  };

  const undo = () => {
    const restores = historyUndoSelection(historyRef.current);
    const leaving = selectionNow();
    setHistory((h) => historyUndo(h, leaving));
    return restores;
  };

  // Abort-to-checkpoint for Escape during a drag (see historyCancel).
  const cancelToCheckpoint = () => {
    setHistory(historyCancel);
  };

  const redo = () => {
    const restores = historyRedoSelection(historyRef.current);
    setHistory(historyRedo);
    return restores;
  };

  // Replace the present tab list with `tabs` and CLEAR history. For
  // genuine context switches (hydrating on mount, opening a different
  // document, loading a tab) where prior undo states no longer apply.
  // Remote peer merges use `applyRemote` instead, to keep history.
  // Stable identity (setHistory never changes): the per-tab load effect
  // (usePerTabLoad) reaches this through resetTabs, and a fresh function
  // every render once made that effect refetch a failed tab on every
  // re-render (docs/specs/017-telemetry/telemetry.md).
  const reset = useCallback((tabs: Tab[] | ((prev: Tab[]) => Tab[])) => {
    setHistory((h) => historyReset(h, tabs));
  }, []);

  // Merge a remote peer's change into the present, preserving undo/redo.
  const applyRemote = (tabs: Tab[] | ((prev: Tab[]) => Tab[])) => {
    setHistory((h) => historyApplyRemote(h, tabs));
  };

  // Stable: the room's op handler and the changeset feed hold it.
  const applyRemoteOp = useCallback((apply: RemoteApply) => {
    setHistory((h) => historyApplyRemoteOp(h, apply));
  }, []);

  // Stable: useItemUndo calls it from item writes.
  const clearRedo = useCallback(() => {
    setHistory(historyClearRedo);
  }, []);

  return {
    depth: depthOf(history),
    branch: branchOf(history),
    futureLength: history.future.length,
    clearRedo,
    tabs: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    tick,
    markCheckpoint,
    cancelToCheckpoint,
    reset,
    applyRemote,
    applyRemoteOp,
    undo,
    redo,
  };
}
