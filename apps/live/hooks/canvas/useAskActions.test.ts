// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StormAskResponse } from '@livedoc/api-schema';
import { isLanePlan, isSuggestion, type Element, type Tab } from '@livedoc/document';
import { FOLD_BY } from '@livedoc/storm-reading';
import { ASK_FAILURES } from '@/lib/ask';
import { ES_ASK_HAND_KEY } from '@/lib/ask-hand';
import { askViewFor, openAsk, resetAskViewForTests } from '@/lib/ask-view';
import { note, orderFlow } from '@/lib/change-board.fixture';
import { kitchenTab, lanePlan } from '@/lib/lane-board.fixture';
import { openReview, resetReviewViewForTests, reviewViewFor } from '@/lib/review-view';
import { setSuggestionsPanelOpen, suggestionViewFor } from '@/lib/suggestion-view';
import { useAskActions } from './useAskActions';

// The acts of an ask (docs/specs/021-event-storming/asks.md "Where an ask starts", "The built-in hand"): the prompt
// copied, the built-in model asked and its answer added as one undoable step, the About kept, the declined
// forgotten, and the board's own fold.

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));
const askBuiltIn = vi.fn<typeof import('@/lib/api/storm-ask').askBuiltIn>();
vi.mock('@/lib/api/storm-ask', () => ({
  askBuiltIn: (...a: Parameters<typeof askBuiltIn>) => askBuiltIn(...a),
}));

const info = vi.spyOn(console, 'info').mockImplementation(() => {});
const suggested = (id: string, anchorId: string): Element => ({
  ...note(id, 'Order paid', 2),
  esSuggestion: { anchorId, side: 'after', by: 'Built-in model' },
});
const answerOf = (over: Partial<StormAskResponse> = {}) => ({
  ok: true as const,
  added: [],
  names: [],
  changes: [],
  lines: 1,
  dropped: 0,
  ...over,
});

function setup(
  over: Partial<Tab> = {},
  opts: { createBlocked?: boolean; selected?: { notes: string[]; contexts: string[] } } = {},
) {
  let tab: Tab = {
    id: 't',
    name: 'Orders',
    kind: 'event-storming',
    elements: orderFlow(),
    ...over,
  };
  const commitTab = vi.fn((mapTab: (t: Tab) => Tab) => {
    tab = mapTab(tab);
  });
  const notify = vi.fn();
  const acts = renderHook(() =>
    useAskActions({
      activeTab: tab,
      createBlocked: opts.createBlocked ?? false,
      commitTab,
      liveTab: () => tab,
      notify,
      selected: () => opts.selected ?? { notes: [], contexts: [] },
      caller: { ownerId: 'guest-1', share: null },
    }),
  ).result.current;
  return { acts, commitTab, notify, tab: () => tab };
}

beforeEach(() => {
  track.mockClear();
  askBuiltIn.mockReset();
  info.mockClear();
  localStorage.clear();
  resetAskViewForTests();
  resetReviewViewForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe('useAskActions: opening', () => {
  it('opens about the selection, or about what the opener names', () => {
    const { acts } = setup({}, { selected: { notes: ['place'], contexts: [] } });
    acts.openAsk();
    expect(askViewFor('t')).toMatchObject({ open: true, scope: { type: 'notes', ids: ['place'] } });
    acts.openAsk({ type: 'context', id: 'ordering' });
    expect(askViewFor('t').scope).toEqual({ type: 'context', id: 'ordering' });
  });

  it('closes the suggestions list: the two share one corner', () => {
    const { acts } = setup();
    setSuggestionsPanelOpen('t', true);
    openReview('t');
    acts.openAsk();
    expect(suggestionViewFor('t').panelOpen).toBe(false);
    // The Review panel too: one thing open in the corner (board-review.md "The panel").
    expect(reviewViewFor('t').open).toBe(false);
  });

  it('stays shut where the board may not be changed', () => {
    const { acts } = setup({}, { createBlocked: true });
    acts.openAsk();
    expect(askViewFor('t').open).toBe(false);
  });
});

describe('useAskActions: Copy Prompt', () => {
  it('copies the prompt, remembers the hand and counts it once', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { acts } = setup();
    expect(await acts.copyPrompt('the prompt', 'mcp')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('the prompt');
    expect(localStorage.getItem(ES_ASK_HAND_KEY)).toBe('mcp');
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'AskPromptCopied']]);
    expect(info).toHaveBeenCalledWith('[ask] copied', { hand: 'mcp' });
  });

  it('says so when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    const { acts } = setup();
    expect(await acts.copyPrompt('the prompt', 'cli')).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });
});

describe('useAskActions: the built-in hand', () => {
  it('sends the board and adds the answer as one step, then says how many', async () => {
    askBuiltIn.mockResolvedValue(answerOf({ added: [suggested('paid', 'placed')] }));
    const { acts, commitTab, notify, tab } = setup({ esAbout: 'A shop that ships books.' });
    openAsk('t', { type: 'board' });
    await acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    const [request, caller] = askBuiltIn.mock.calls[0]!;
    expect(request).toMatchObject({
      topic: 'gaps',
      scope: { type: 'board' },
      tab: { id: 't', name: 'Orders', kind: 'event-storming', esAbout: 'A shop that ships books.' },
    });
    expect(request.tab.elements).toHaveLength(orderFlow().length);
    expect(caller).toMatchObject({ ownerId: 'guest-1', share: null });
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(tab().elements.filter(isSuggestion)).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith('1 suggestion added');
    expect(askViewFor('t')).toMatchObject({ open: false, asking: false });
    expect(localStorage.getItem(ES_ASK_HAND_KEY)).toBe('built-in');
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'AskedBuiltIn']]);
    expect(info).toHaveBeenCalledWith('[ask] answer', { added: 1, dropped: 0 });
  });

  it('shows it is asking until the answer comes', async () => {
    let answer!: (value: Awaited<ReturnType<typeof askBuiltIn>>) => void;
    askBuiltIn.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { acts } = setup();
    const asked = acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    expect(askViewFor('t').asking).toBe(true);
    answer(answerOf());
    await asked;
    expect(askViewFor('t').asking).toBe(false);
  });

  it('says there was nothing to suggest, and stays open', async () => {
    askBuiltIn.mockResolvedValue(answerOf({ dropped: 1 }));
    const { acts, notify, tab } = setup();
    openAsk('t', { type: 'board' });
    const before = tab();
    await acts.ask({ topic: 'wording', scope: { type: 'board' } });
    expect(tab()).toBe(before);
    expect(notify).toHaveBeenCalledWith('Nothing to suggest');
    expect(askViewFor('t').open).toBe(true);
  });

  it('passes over what the board no longer holds by the time the answer comes', async () => {
    askBuiltIn.mockResolvedValue(answerOf({ added: [suggested('paid', 'gone')] }));
    const { acts, notify, tab } = setup();
    await acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    expect(tab().elements.filter(isSuggestion)).toHaveLength(0);
    expect(notify).toHaveBeenCalledWith('Nothing to suggest');
  });

  it('says why it failed, and what to do', async () => {
    askBuiltIn.mockResolvedValue({ ok: false, error: 'rate_limited' });
    const { acts, commitTab, notify } = setup();
    await acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    expect(askViewFor('t')).toMatchObject({ asking: false, failure: ASK_FAILURES.rate_limited });
    expect(commitTab).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[ask] failed', { error: 'rate_limited' });
    askBuiltIn.mockRejectedValue(new TypeError('network'));
    await acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    expect(askViewFor('t').failure).toBe(ASK_FAILURES.ai_failed);
  });

  it('cancels: the request is aborted and a late answer is ignored', async () => {
    let answer!: (value: Awaited<ReturnType<typeof askBuiltIn>>) => void;
    askBuiltIn.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { acts, commitTab, notify } = setup();
    const asked = acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    acts.cancelAsk();
    expect(askBuiltIn.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(askViewFor('t').asking).toBe(false);
    answer(answerOf({ added: [suggested('paid', 'placed')] }));
    await asked;
    expect(commitTab).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('asks once at a time, and never where the board may not be changed', async () => {
    askBuiltIn.mockReturnValue(new Promise(() => {}));
    const { acts } = setup();
    void acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    void acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    expect(askBuiltIn).toHaveBeenCalledTimes(1);
    const blocked = setup({ id: 'other' }, { createBlocked: true });
    await blocked.acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    expect(askBuiltIn).toHaveBeenCalledTimes(1);
  });

  it('says the plan is the board’s own fold when no model’s plan kept what the board says', async () => {
    const { acts, notify, tab } = setup(kitchenTab());
    askBuiltIn.mockResolvedValue(answerOf({ added: [lanePlan({ by: FOLD_BY })], folded: true }));
    await acts.ask({ topic: 'lanes', scope: { type: 'board' }, lanes: 2 });
    expect(tab().elements.some(isLanePlan)).toBe(true);
    expect(notify).toHaveBeenLastCalledWith(
      'The model’s plan would change what the board says. This is the board’s own fold.',
    );
    expect(track.mock.calls.map(([, , type]) => type)).toEqual(['AskedBuiltIn', 'LanesFolded']);
  });

  it('says why there is no fold either', async () => {
    const { acts, notify, tab } = setup(kitchenTab());
    askBuiltIn.mockResolvedValue(answerOf({ folded: 'fits' }));
    await acts.ask({ topic: 'lanes', scope: { type: 'board' }, lanes: 4 });
    expect(notify).toHaveBeenLastCalledWith('The board already fits 4 lanes.');
    expect(tab().elements.some(isLanePlan)).toBe(false);
    expect(track.mock.calls.map(([, , type]) => type)).toEqual(['AskedBuiltIn']);
  });
});

describe('useAskActions: the board’s own fold', () => {
  it('adds the fold as the open plan, by LiveDoc, in one step', () => {
    const { acts, commitTab, notify, tab } = setup(kitchenTab());
    openAsk('t', { type: 'board' });
    acts.foldBoard(2);
    expect(commitTab).toHaveBeenCalledTimes(1);
    const plan = tab().elements.find(isLanePlan);
    expect(plan?.esLanePlan).toMatchObject({ by: FOLD_BY });
    expect(plan?.esLanePlan.lanes).toHaveLength(2);
    expect(notify).toHaveBeenCalledWith('1 suggestion added');
    expect(askViewFor('t').open).toBe(false);
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'LanesFolded']]);
  });

  it('says why there is nothing to fold', () => {
    const { acts, commitTab, notify } = setup(kitchenTab());
    acts.foldBoard(4);
    expect(commitTab).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('The board already fits 4 lanes.');
    expect(track).not.toHaveBeenCalled();
  });
});

describe('useAskActions: the About and the declined', () => {
  it('keeps the About as one step when it changed, and counts it', () => {
    const { acts, commitTab, tab } = setup();
    acts.saveAbout('  A shop that ships books.  ');
    expect(tab().esAbout).toBe('A shop that ships books.');
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'AboutEdited']]);
  });

  it('writes nothing when the About is as it was', () => {
    const { acts, commitTab } = setup({ esAbout: 'A shop.' });
    acts.saveAbout('A shop. ');
    expect(commitTab).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it('forgets what was declined in one step', () => {
    const esDeclined = [{ type: 'note' as const, words: 'Order lost', about: ['placed'] }];
    const { acts, commitTab, tab } = setup({ esDeclined });
    acts.forgetDeclined();
    expect(tab().esDeclined).toBeUndefined();
    expect(commitTab).toHaveBeenCalledTimes(1);
    expect(track.mock.calls).toEqual([['Canvas', 'Used', 'DeclinedForgotten']]);
    const none = setup();
    none.acts.forgetDeclined();
    expect(none.commitTab).not.toHaveBeenCalled();
  });

  it('changes nothing where the board may not be changed', () => {
    const { acts, commitTab } = setup({ esDeclined: [] }, { createBlocked: true });
    acts.saveAbout('A shop.');
    acts.forgetDeclined();
    acts.foldBoard(2);
    expect(commitTab).not.toHaveBeenCalled();
  });
});

describe('useAskActions: a board that moved on', () => {
  it('adds nothing to another board opened while the model worked', async () => {
    askBuiltIn.mockResolvedValue(answerOf({ added: [suggested('paid', 'placed')] }));
    let tab: Tab = { id: 't', name: 'Orders', kind: 'event-storming', elements: orderFlow() };
    const commitTab = vi.fn();
    const notify = vi.fn();
    const acts = renderHook(() =>
      useAskActions({
        activeTab: tab,
        createBlocked: false,
        commitTab,
        liveTab: () => tab,
        notify,
        selected: () => ({ notes: [], contexts: [] }),
        caller: { ownerId: 'guest-1', share: null },
      }),
    ).result.current;
    const asked = acts.ask({ topic: 'gaps', scope: { type: 'board' } });
    tab = { ...tab, id: 'another' };
    await asked;
    expect(commitTab).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Nothing to suggest');
  });
});
