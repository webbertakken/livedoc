import {
  LANES_MAX,
  openLanePlan,
  plannableNotes,
  withoutLanePlans,
  type Element,
  type ElementId,
  type Tab,
} from '@livedoc/document';
import { applyLanePlan, arrangeBoard, checkLanePlan } from '@livedoc/storm-reading';
import { arrangeRefusal } from '@/lib/board-offer';
import { arrangeRefusalWords } from '@/lib/board-offer-words';
import { debugLog } from '@/lib/debug-log';
import { startArranging, stopArranging } from '@/lib/suggestion-view';
import { track } from '@/lib/telemetry';

// The Event Storming family's code (docs/specs/016-platform/web-performance.md), reached through useLaneActions
// and the registry at the press; never imported statically.
//
// The acts that rearrange a whole event-storming board (docs/specs/021-event-storming/lane-plans.md "How a person
// sees and decides", docs/specs/021-event-storming/arrange.md "How a person arranges"): apply or dismiss the open lane
// plan, and Arrange and Reorder, which previews first and writes only when kept. Each write is ONE step through the
// ordinary choke point, so one Undo takes it back. The board each leaves is the reading's own placing, checked again
// on the board as it stands when the step is taken. A plan's dismissal is not remembered as declined.

export type LaneActionsDeps = {
  activeTab: Tab;
  // The creation gate (a view-only session, a locked tab, a hidden or locked active layer): every act reshapes.
  createBlocked: boolean;
  commit: (mapper: (els: Element[]) => Element[]) => void;
  // One undoable step over the whole tab: the check reads its layers.
  commitTab: (mapTab: (tab: Tab) => Tab) => void;
  // A one-line notice, for a board with nothing to arrange.
  notify: (message: string) => void;
  // Select one element: a note a refusal names is a way in to fix the board by hand.
  select: (id: ElementId) => void;
};

export type LaneActions = {
  applyLanePlan: () => void;
  dismissLanePlan: () => void;
  // Preview the board arranged along the timeline, or say why it is not.
  arrange: () => void;
  // Write the arrangement being previewed.
  keepArranged: () => void;
  // Select a note a refusal names.
  selectNote: (id: ElementId) => void;
};

type Refusal = 'blocked' | 'no-plan' | 'stale' | 'not-arrangeable';
const refuse = (reason: Refusal) => debugLog('[lanes] refused', { reason });

export function laneVerbs({
  activeTab,
  createBlocked,
  commit,
  commitTab,
  notify,
  select,
}: LaneActionsDeps): LaneActions {
  const applyPlan = () => {
    if (createBlocked) return refuse('blocked');
    const plan = openLanePlan(activeTab.elements)?.esLanePlan;
    if (!plan) return refuse('no-plan');
    const verdict = checkLanePlan(activeTab, plan);
    if (!verdict.ok) return refuse('stale');
    // The lane names are named once, so the board is the same however often the commit maps it.
    const nameIds = Array.from({ length: LANES_MAX }, () => crypto.randomUUID());
    commitTab((tab) => {
      let next = 0;
      const elements = applyLanePlan(tab, plan, () => nameIds[next++]!);
      return elements ? { ...tab, elements } : tab;
    });
    debugLog('[lanes] plan applied', {
      lanes: plan.lanes.length,
      notes: plan.lanes.reduce((sum, lane) => sum + lane.notes.length, 0),
      gained: verdict.gained,
    });
    track('Canvas', 'Used', 'LanePlanApplied');
  };

  const dismissPlan = () => {
    if (createBlocked) return refuse('blocked');
    if (!openLanePlan(activeTab.elements)) return refuse('no-plan');
    commit(withoutLanePlans);
    debugLog('[lanes] plan dismissed', {});
    track('Canvas', 'Used', 'LanePlanDismissed');
  };

  const arrange = () => {
    if (createBlocked) return refuse('blocked');
    const refusal = arrangeRefusal(activeTab);
    // Nothing to follow, or nothing to move: said in a line. A refusal with ways in is shown by the bar.
    if (refusal?.why === 'no_events' || refusal?.why === 'already')
      notify(arrangeRefusalWords(refusal, activeTab.elements).message);
    else startArranging(activeTab.id);
    debugLog('[lanes] arrange', { outcome: refusal?.why ?? 'preview' });
  };

  const keepArranged = () => {
    if (createBlocked) return refuse('blocked');
    const arranged = arrangeBoard(activeTab);
    stopArranging(activeTab.id);
    if (!arranged.ok) return refuse('not-arrangeable');
    commitTab((tab) => {
      const again = arrangeBoard(tab);
      return again.ok ? { ...tab, elements: again.elements } : tab;
    });
    debugLog('[lanes] arranged', {
      notes: plannableNotes(activeTab).length,
      gap: arranged.gap,
      gained: arranged.gained,
    });
    track('Canvas', 'Used', 'BoardArranged');
  };

  return {
    applyLanePlan: applyPlan,
    dismissLanePlan: dismissPlan,
    arrange,
    keepArranged,
    selectNote: select,
  };
}
