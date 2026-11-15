import { LANES_MAX, LANES_MIN, aboutOf, declinedOf, type Tab } from '@livedoc/document';
import {
  STORM_ASKS,
  STORM_ASK_HANDS,
  askPrompt,
  askScopeHolds,
  askTopicsFor,
  readBoard,
  sayNoFold,
  wordsOf,
  type AskScope,
  type StormAskHand,
  type StormAskTopic,
} from '@livedoc/storm-reading';

// The Ask popover's model (docs/specs/021-event-storming/asks.md "Where an ask starts"): from the board, what the
// ask is about and what the person has picked so far, everything the popover shows. Pure, so the popover draws and
// the acts act on the same answer.

/** What `cli` and `mcp` say in place of a prompt for a board saved only in This Browser. */
export const ASK_UNREACHABLE =
  'This board is saved only in this browser, so an agent cannot reach it. Use the built-in model, or save it to your account.';

/** Why the built-in hand failed, and what to do, by the route's refusal. */
export const ASK_FAILURES = {
  sign_in_required: 'Sign in to ask the built-in model.',
  rate_limited: 'Too many asks just now. Wait a minute and ask again.',
  board_too_large:
    'This board is too large for the built-in model. Copy the prompt for your agent instead.',
  ai_failed: 'The model did not answer. Copy the prompt for your agent instead.',
} as const;

export function askFailure(error: string): string {
  return error in ASK_FAILURES
    ? ASK_FAILURES[error as keyof typeof ASK_FAILURES]
    : ASK_FAILURES.ai_failed;
}

/** What an ask ends on: how many suggestions landed, or what became of a lane plan no model's answer kept. */
export function askedNotice(
  added: number,
  folded?: true | 'fits' | 'no_arrangement',
  lanes = LANES_MIN,
): string {
  if (folded === true)
    return 'The model’s plan would change what the board says. This is the board’s own fold.';
  if (folded) return sayNoFold(folded, lanes);
  if (added === 0) return 'Nothing to suggest';
  return `${added} ${added === 1 ? 'suggestion' : 'suggestions'} added`;
}

type AskModelInput = {
  tab: Pick<Tab, 'id' | 'name' | 'elements' | 'layers' | 'esAbout' | 'esDeclined'>;
  // What the ask was opened about, and what the person has picked since: null where they have not.
  scope: AskScope;
  topic: StormAskTopic | null;
  hand: StormAskHand;
  lanes: number | null;
  // The deployment has a model; the document is saved only in This Browser.
  aiEnabled: boolean;
  thisBrowser: boolean;
  board: { document: string; documentId: string; link: string };
};

export type AskModel = {
  // What the ask is about: the board, when what was selected has gone.
  scope: AskScope;
  about: string;
  topics: { topic: StormAskTopic; menu: string }[];
  topic: StormAskTopic;
  // The lane count's stepper, for a lane plan alone.
  lanes: { value: number; min: number; max: number } | null;
  hands: StormAskHand[];
  hand: StormAskHand;
  // What Copy Prompt copies; null for the built-in hand and for a board no agent can reach, which says why.
  prompt: string | null;
  unreachable: string | null;
  // Arrange and Reorder is offered, apart from the topics: the board's own act, with nothing selected.
  arrange: boolean;
  aboutText: string;
  declined: number;
};

function aboutWords(scope: AskScope, tab: AskModelInput['tab']): string {
  if (scope.type === 'board') return 'About the board';
  if (scope.type === 'notes')
    return `About ${scope.ids.length} ${scope.ids.length === 1 ? 'note' : 'notes'}`;
  if (scope.type === 'contexts') return `About ${scope.ids.length} contexts`;
  const name = wordsOf(tab.elements.find((el) => el.id === scope.id)?.label);
  return name ? `About “${name}”` : 'About 1 context';
}

const clampLanes = (count: number) => Math.min(LANES_MAX, Math.max(LANES_MIN, Math.round(count)));

export function askModel(input: AskModelInput): AskModel {
  const { tab, aiEnabled, thisBrowser, board } = input;
  const scope: AskScope = askScopeHolds(input.scope, tab.elements)
    ? input.scope
    : { type: 'board' };
  const offered = askTopicsFor(scope);
  const topic = input.topic && offered.includes(input.topic) ? input.topic : offered[0]!;
  const hands = STORM_ASK_HANDS.filter((hand) => hand !== 'built-in' || aiEnabled);
  const hand = hands.includes(input.hand) ? input.hand : hands[0]!;
  const lanes =
    topic === 'lanes'
      ? {
          value: clampLanes(input.lanes ?? readBoard(tab).lanes.length),
          min: LANES_MIN,
          max: LANES_MAX,
        }
      : null;
  const reachable = hand !== 'built-in' && !thisBrowser;
  return {
    scope,
    about: aboutWords(scope, tab),
    topics: offered.map((t) => ({ topic: t, menu: STORM_ASKS[t].menu })),
    topic,
    lanes,
    hands,
    hand,
    prompt: reachable
      ? askPrompt({
          topic,
          scope,
          hand,
          lanes: lanes?.value,
          board: { ...board, tab: tab.name, tabId: tab.id },
          elements: tab.elements,
        })
      : null,
    unreachable: hand !== 'built-in' && thisBrowser ? ASK_UNREACHABLE : null,
    arrange: scope.type === 'board',
    aboutText: aboutOf(tab),
    declined: declinedOf(tab).length,
  };
}
