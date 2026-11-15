import { setAnswer, setPivotal, type Element, type ElementId, type Tab } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

// The acts on an Event Storming board's structure (docs/specs/021-event-storming/board-structure.md "Pivotal
// events", "Hotspot answers"): mark or unmark a pivotal event, keep a hotspot's answer. Each is ONE commit through
// the ordinary choke point, so one Undo takes it back; the board each leaves is the document's own structure writes.

type StructureActionsDeps = {
  activeTab: Tab;
  // Whoever may not change the structure: anyone but an Editor, and an Editor on a board that takes no change (a
  // locked tab, a hidden or locked active layer).
  blocked: boolean;
  commit: (mapper: (els: Element[]) => Element[]) => void;
};

export type StructureActions = {
  setPivotal: (id: ElementId, on: boolean) => void;
  // Keep a hotspot's answer; a blank one reopens the question.
  saveAnswer: (id: ElementId, text: string) => void;
};

type Refusal = 'blocked' | 'unchanged';
const refuse = (reason: Refusal) => debugLog('[structure] refused', { reason });

export function useStructureActions({
  activeTab,
  blocked,
  commit,
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

  return { setPivotal: mark, saveAnswer };
}
