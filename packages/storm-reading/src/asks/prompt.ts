// An ask in words (docs/specs/021-event-storming/asks.md "The prompt", "The built-in hand"): the one sentence that
// says what is asked and about what, the prompt a person copies for their agent, and the messages the built-in
// model is sent. Built by pure functions from the topic, the scope and the hand, so every surface shows the same
// words; the briefs are what a model is told, and nothing here is a step to take.

import { computeRefs, type Element, type ElementId, type Tab } from '@livedoc/document';
import { readDeclined } from '../declined';
import { formatStormView } from '../format';
import { readLanePlan } from '../lanes/view';
import { wordsOf } from '../notes';
import { readBoard } from '../reading';
import { readSuggestedChanges } from '../suggested-changes';
import { readSuggestions } from '../suggestions';
import { ASK_BRIEFS, ASK_DATA_RULE, ASK_RULE } from './briefs';
import type { AskScope, StormAskHand, StormAskTopic } from './catalogue';
import { ASK_LINES } from './lines';

/** How many notes or contexts a sentence names before it counts the rest. */
export const ASK_SCOPE_SHOWN = 12;

/** The board an ask is about, as a person and an agent know it. */
export type AskBoard = {
  document: string;
  tab: string;
  link: string;
  documentId: string;
  tabId: string;
};

type Said = { role: 'system' | 'user' | 'assistant'; content: string };

const listed = (items: string[]): string => {
  const shown = items.slice(0, ASK_SCOPE_SHOWN);
  const more = items.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : shown.join('');
};

// What the scope is, in words: null for the board. What is no longer on the board is passed over.
function aboutOf(scope: AskScope, elements: readonly Element[]): string | null {
  if (scope.type === 'board') return null;
  const refs = computeRefs(elements.map((el) => el.id));
  const byId = new Map(elements.map((el) => [el.id, el]));
  const say = (ids: readonly ElementId[]) =>
    listed(
      ids
        .filter((id) => byId.has(id))
        .map((id) => {
          const words = wordsOf(byId.get(id)!.label);
          return words ? `${refs.refOf(id)} "${words}"` : refs.refOf(id);
        }),
    );
  if (scope.type === 'notes') return say(scope.ids);
  return scope.type === 'context'
    ? `the candidate context ${say([scope.id])}`
    : `the candidate contexts ${say(scope.ids)}`;
}

/** The ask in one sentence, naming what it is about by ref and words. */
export function askSentence(
  topic: StormAskTopic,
  scope: AskScope,
  elements: readonly Element[],
  lanes?: number,
): string {
  const about = aboutOf(scope, elements);
  switch (topic) {
    case 'gaps':
      return about
        ? `Suggest the notes missing round ${about}.`
        : 'Suggest the notes this board is missing.';
    case 'contexts':
      return 'Group the notes of this board into candidate contexts.';
    case 'names':
      return `Suggest other names for ${about}.`;
    case 'merge':
      return `Suggest one name for ${about} merged into one.`;
    case 'wording':
      if (!about) return 'Sharpen the wording of the notes on this board.';
      return scope.type === 'context'
        ? `Sharpen the wording of the notes in ${about}.`
        : `Sharpen the wording of ${about}.`;
    case 'lanes':
      return `Reorganise this board into ${lanes} lanes.`;
  }
}

// The guide that teaches a topic's lines, beside the one that teaches the board.
const GUIDES: Partial<Record<StormAskTopic, string>> = {
  names: 'storm-changes',
  merge: 'storm-changes',
  wording: 'storm-changes',
  lanes: 'storm-lanes',
};

function wayIn(hand: Exclude<StormAskHand, 'built-in'>, topic: StormAskTopic, board: AskBoard) {
  if (hand === 'mcp')
    return [
      'With the LiveDoc MCP tools:',
      `  read_event_storming, with documentId "${board.documentId}" and tab "${board.tabId}"`,
      `  suggest_notes, with documentId "${board.documentId}" and tabId "${board.tabId}"`,
    ];
  const guide = GUIDES[topic];
  const at = `${board.documentId} --tab ${board.tabId}`;
  return [
    'With the livedoc CLI:',
    '  livedoc guide storm',
    ...(guide ? [`  livedoc guide ${guide}`] : []),
    `  livedoc storm read ${at}`,
    `  livedoc storm suggest ${at} -f -`,
  ];
}

/** What Copy Prompt copies: the board, the ask, the topic's brief, the hand's way in, and the rule. */
export function askPrompt(input: {
  topic: StormAskTopic;
  scope: AskScope;
  hand: Exclude<StormAskHand, 'built-in'>;
  lanes?: number;
  board: AskBoard;
  elements: readonly Element[];
}): string {
  const { topic, scope, hand, lanes, board, elements } = input;
  return [
    `Board: "${board.document}", tab "${board.tab}"`,
    board.link,
    '',
    askSentence(topic, scope, elements, lanes),
    '',
    ASK_BRIEFS[topic],
    ASK_DATA_RULE,
    '',
    ...wayIn(hand, topic, board),
    '',
    ASK_RULE,
  ].join('\n');
}

const ANSWER_FORMAT =
  'Answer with one JSON object and nothing else: {"lines": ["<line>", "<line>"]}. With nothing to suggest, an empty list.';

/** What the built-in model is sent: the brief and its lines, then the board as the reading prints it and the ask.
 *  Asked again after a refusal, it is shown its answer and why the board refused it. */
export function askMessages(input: {
  topic: StormAskTopic;
  scope: AskScope;
  lanes?: number;
  tab: Pick<Tab, 'id' | 'name' | 'elements' | 'esAbout' | 'esDeclined' | 'layers'>;
  refused?: { lines: readonly string[]; why: string };
}): Said[] {
  const { topic, scope, lanes, tab, refused } = input;
  const view = formatStormView(readBoard(tab), readSuggestions(tab), {
    changes: readSuggestedChanges(tab),
    plan: readLanePlan(tab),
    declined: readDeclined(tab),
  });
  const asked: Said[] = [
    {
      role: 'system',
      content: [
        'You help a workshop with its Event Storming board.',
        ASK_BRIEFS[topic],
        ASK_DATA_RULE,
        ASK_LINES[topic],
        ANSWER_FORMAT,
      ].join('\n\n'),
    },
    {
      role: 'user',
      content: [...view, '', askSentence(topic, scope, tab.elements, lanes)].join('\n'),
    },
  ];
  if (!refused) return asked;
  return [
    ...asked,
    { role: 'assistant', content: JSON.stringify({ lines: refused.lines }) },
    {
      role: 'user',
      content: `The board refused that: ${refused.why}\nAnswer again, changing what it names.`,
    },
  ];
}
