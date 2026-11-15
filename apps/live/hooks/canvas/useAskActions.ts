import { useRef } from 'react';
import {
  aboutOf,
  declinedOf,
  withAbout,
  withoutDeclined,
  type ElementId,
  type Tab,
} from '@livedoc/document';
import {
  FOLD_REASON_OWN,
  addAskAnswer,
  askScopeOf,
  foldPlan,
  sayNoFold,
  type AskAnswer,
  type AskScope,
  type StormAskHand,
  type StormAskTopic,
} from '@livedoc/storm-reading';
import { askBuiltIn, type BuiltInAnswer } from '@/lib/api/storm-ask';
import { askFailure, askedNotice } from '@/lib/ask';
import { writeAskHand } from '@/lib/ask-hand';
import { closeAsk, openAsk, setAskFailure, setAsking } from '@/lib/ask-view';
import { clearCornerFor } from '@/lib/corner-view';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

// The acts of an ask (docs/specs/021-event-storming/asks.md "Where an ask starts", "The built-in hand"): open the
// popover about the selection, copy the prompt for an agent, ask the deployment's model and add what it answers,
// keep the About, forget what was declined, and offer the board's own fold. Whoever answers, the answer is
// suggestions: each write is ONE step through the ordinary choke point, onto the board as it is by then.

type AskActionsDeps = {
  activeTab: Tab;
  // The creation gate (a view-only session, a locked tab, a hidden or locked active layer): a suggestion is new.
  createBlocked: boolean;
  // One undoable step over the whole tab: the About and the declined list are the tab's.
  commitTab: (mapTab: (tab: Tab) => Tab) => void;
  // The tab as it is now: an answer comes back after the board may have moved on.
  liveTab: () => Tab;
  // A one-line notice: what an ask ended on.
  notify: (message: string) => void;
  // What is selected when the popover opens: the editor's selection, and the selected contexts.
  selected: () => { notes: readonly ElementId[]; contexts: readonly ElementId[] };
  // Who asks, for the built-in hand's route.
  caller: { ownerId: string; share: string | null };
};

export type AskActions = {
  // Open the popover about `scope` or, without one, about what is selected. It shares the suggestions corner
  // with the list: opening one closes the other.
  openAsk: (scope?: AskScope) => void;
  // Copy the prompt for an agent; false when the clipboard refused.
  copyPrompt: (prompt: string, hand: StormAskHand) => Promise<boolean>;
  // Ask the built-in model and add what it answers.
  ask: (ask: { topic: StormAskTopic; scope: AskScope; lanes?: number }) => Promise<void>;
  cancelAsk: () => void;
  saveAbout: (text: string) => void;
  forgetDeclined: () => void;
  // Offer the board's own fold into that many lanes, without a model.
  foldBoard: (lanes: number) => void;
};

const refuse = (reason: 'blocked' | 'asking') => debugLog('[ask] refused', { reason });

export function useAskActions({
  activeTab,
  createBlocked,
  commitTab,
  liveTab,
  notify,
  selected,
  caller,
}: AskActionsDeps): AskActions {
  // The ask under way: one at a time, so Cancel knows which request to end and a late answer finds itself replaced.
  const asking = useRef<AbortController | null>(null);
  const tabId = activeTab.id;

  // The answer onto the board as it is by now, as one step; how many suggestions landed.
  const add = (answer: AskAnswer): number => {
    const now = liveTab();
    // Another board was opened meanwhile: the answer was for the one that asked.
    if (now.id !== tabId) return 0;
    const { added } = addAskAnswer(now.elements, answer);
    if (added === 0) return 0;
    commitTab((tab) =>
      tab.id === tabId ? { ...tab, elements: addAskAnswer(tab.elements, answer).elements } : tab,
    );
    closeAsk(tabId);
    return added;
  };

  const open = (scope?: AskScope) => {
    if (createBlocked) return refuse('blocked');
    const about = scope ?? askScopeOf(activeTab.elements, selected());
    clearCornerFor(tabId, 'ask');
    openAsk(tabId, about);
    debugLog('[ask] opened', { scope: about.type });
  };

  const copyPrompt = async (prompt: string, hand: StormAskHand) => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      debugLog('[ask] failed', { error: 'clipboard' });
      return false;
    }
    writeAskHand(hand);
    debugLog('[ask] copied', { hand });
    track('Canvas', 'Used', 'AskPromptCopied');
    return true;
  };

  const ask = async (asked: { topic: StormAskTopic; scope: AskScope; lanes?: number }) => {
    if (createBlocked) return refuse('blocked');
    if (asking.current) return refuse('asking');
    const request = new AbortController();
    asking.current = request;
    setAsking(tabId, true);
    writeAskHand('built-in');
    debugLog('[ask] asked', { topic: asked.topic });
    track('Canvas', 'Used', 'AskedBuiltIn');
    const { id, name, kind, elements, layers, esAbout, esDeclined } = activeTab;
    let answer: BuiltInAnswer;
    try {
      answer = await askBuiltIn(
        { ...asked, tab: { id, name, kind, elements, layers, esAbout, esDeclined } },
        { ...caller, signal: request.signal },
      );
    } catch {
      answer = { ok: false, error: 'ai_failed' };
    }
    // Cancelled meanwhile: a late answer is ignored.
    if (asking.current !== request) return;
    asking.current = null;
    if (!answer.ok) {
      setAskFailure(tabId, askFailure(answer.error));
      debugLog('[ask] failed', { error: answer.error });
      return;
    }
    setAsking(tabId, false);
    const added = add(answer);
    debugLog('[ask] answer', { added, dropped: answer.dropped });
    if (answer.folded === true) track('Canvas', 'Used', 'LanesFolded');
    notify(askedNotice(added, answer.folded, asked.lanes));
  };

  const cancelAsk = () => {
    asking.current?.abort();
    asking.current = null;
    setAsking(tabId, false);
    debugLog('[ask] cancelled', {});
  };

  const saveAbout = (text: string) => {
    if (createBlocked) return refuse('blocked');
    if (aboutOf(withAbout(activeTab, text)) === aboutOf(activeTab)) return;
    commitTab((tab) => withAbout(tab, text));
    debugLog('[ask] about kept', { chars: aboutOf({ esAbout: text }).length });
    track('Canvas', 'Used', 'AboutEdited');
  };

  const forgetDeclined = () => {
    if (createBlocked) return refuse('blocked');
    const count = declinedOf(activeTab).length;
    if (count === 0) return;
    commitTab(withoutDeclined);
    debugLog('[ask] declined forgotten', { count });
    track('Canvas', 'Used', 'DeclinedForgotten');
  };

  const foldBoard = (lanes: number) => {
    if (createBlocked) return refuse('blocked');
    const fold = foldPlan(activeTab, lanes, { id: crypto.randomUUID(), reason: FOLD_REASON_OWN });
    debugLog('[ask] fold', { lanes, outcome: 'none' in fold ? fold.none : 'plan' });
    if ('none' in fold) return notify(sayNoFold(fold.none, lanes));
    const added = add({ added: [fold.plan], names: [], changes: [] });
    track('Canvas', 'Used', 'LanesFolded');
    notify(askedNotice(added));
  };

  return { openAsk: open, copyPrompt, ask, cancelAsk, saveAbout, forgetDeclined, foldBoard };
}
