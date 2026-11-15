import {
  setAnswer,
  setPivotal,
  type BoxedElement,
  type Element,
  type ElementId,
  type Tab,
} from '@livedoc/document';
import { laneNameSpot } from '@livedoc/storm-reading';
import { blankLaneName } from '@/lib/lane-name';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

// The acts on an Event Storming board's structure (docs/specs/021-event-storming/board-structure.md "Pivotal
// events", "Lane names", "Hotspot answers"): mark or unmark a pivotal event, name a lane, keep a hotspot's answer.
// Each is ONE commit through the ordinary choke point, so one Undo takes it back; the board each leaves is the
// document's own structure writes.

type StructureActionsDeps = {
  activeTab: Tab;
  // Whoever may not change the structure: anyone but an Editor, and an Editor on a board that takes no change (a
  // locked tab, a hidden or locked active layer).
  blocked: boolean;
  commit: (mapper: (els: Element[]) => Element[]) => void;
  // Lands a new element centred on a canvas point, opened for typing: the palette's own path.
  addBoxedAt: <T extends BoxedElement>(
    canvasX: number,
    canvasY: number,
    make: (x: number, y: number) => T,
    opts?: { edit?: boolean },
  ) => void;
  // Selects an element and opens its words for typing.
  startEditing: (id: ElementId) => void;
};

export type StructureActions = {
  setPivotal: (id: ElementId, on: boolean) => void;
  // Keep a hotspot's answer; a blank one reopens the question.
  saveAnswer: (id: ElementId, text: string) => void;
  // Name the lane a workshop note stands on: the name it has is opened for typing, else a blank one is added left
  // of the wall and opened.
  nameLane: (noteId: ElementId) => void;
};

type Refusal = 'blocked' | 'unchanged';
const refuse = (reason: Refusal) => debugLog('[structure] refused', { reason });

export function useStructureActions({
  activeTab,
  blocked,
  commit,
  addBoxedAt,
  startEditing,
}: StructureActionsDeps): StructureActions {
  // Whether a write would change the board as it stands; a refusal is logged and nothing is written.
  const changes = (write: (els: Element[]) => Element[]): boolean => {
    const ok = !blocked && write(activeTab.elements) !== activeTab.elements;
    if (!ok) refuse(blocked ? 'blocked' : 'unchanged');
    return ok;
  };

  const mark = (id: ElementId, on: boolean) => {
    const write = (els: Element[]) => setPivotal(els, id, on);
    if (!changes(write)) return;
    commit(write);
    debugLog('[structure] pivotal', { on });
    track('Canvas', 'Used', on ? 'PivotalMarked' : 'PivotalUnmarked');
  };

  const saveAnswer = (id: ElementId, text: string) => {
    const write = (els: Element[]) => setAnswer(els, id, text);
    if (!changes(write)) return;
    commit(write);
    const open = text.trim() === '';
    debugLog('[structure] answered', { open });
    if (!open) track('Canvas', 'Used', 'HotspotAnswered');
  };

  const nameLane = (noteId: ElementId) => {
    const spot = blocked ? null : laneNameSpot(activeTab, noteId);
    if (!spot) return refuse(blocked ? 'blocked' : 'unchanged');
    debugLog('[structure] lane named', { existed: spot.text !== null });
    track('Canvas', 'Used', 'LaneNamed');
    if (spot.text) return startEditing(spot.text.id);
    const name = blankLaneName(crypto.randomUUID(), spot);
    addBoxedAt(name.x + name.width / 2, name.y + name.height / 2, () => name, { edit: true });
  };

  return { setPivotal: mark, saveAnswer, nameLane };
}
