import {
  STORM_ASK_MAX_BYTES,
  STORM_ASK_MAX_NOTES,
  type StormAskError,
  type StormAskRequest,
  type StormAskResponse,
} from '@livedoc/api-schema';
import {
  LANES_MAX,
  LANES_MIN,
  aboutOf,
  declinedOf,
  eventStormingKindOf,
  isEventStormingTab,
  isSuggestion,
  isValidTab,
  withLanePlan,
  type Layer,
  type Tab,
} from '@livedoc/document';
import {
  FOLD_REASON,
  askAnswerOf,
  askFits,
  askMessages,
  askScopeHolds,
  foldPlan,
  isAskScope,
  isAskTopic,
} from '@livedoc/storm-reading';
import { resolveAiProvider } from '../ai-provider';
import { json } from '../responses';
import { runAskLines } from '../storm-ask';
import { askModelLines } from '../storm-ask-model';
import { aiGate } from './ai-gate';
import type { RouteContext } from './context';

// The built-in hand of an ask (docs/specs/021-event-storming/asks.md "The built-in hand"): POST /api/storm-ask.
// The board travels in the request and nothing is stored. The api makes the reading, the deployment's small model
// words an answer as suggest lines, and the edit-operation engine checks each; the route answers what to add, for
// the editor to add as one undoable step. The model can only propose.

// How often a refused lane plan is asked for again before the board's own fold is offered. Safe range: 0 to 2.
export const STORM_ASK_RETRIES = 1;

// What a model is told when its answer to a lane ask held no plan at all.
const NO_LANE_LINE = 'the answer held no suggest-lane line: answer with one line per lane';

const refuse = (error: StormAskError, status: number, message: string) => {
  console.info('[storm] ask refused', { error });
  return json({ error, message }, { status });
};

// The board as sent, holding only what a reading reads, each tab field read as tolerantly as the editor reads it.
function boardOf(tab: Tab): Tab {
  const layers = Array.isArray(tab.layers)
    ? tab.layers.filter((layer: Layer | null) => typeof layer?.id === 'string')
    : [];
  const about = aboutOf(tab);
  return {
    id: tab.id,
    name: tab.name,
    ...(tab.kind !== undefined ? { kind: tab.kind } : {}),
    elements: tab.elements,
    ...(layers.length > 0 ? { layers } : {}),
    ...(about ? { esAbout: about } : {}),
    esDeclined: declinedOf(tab),
  };
}

export async function handleStormAsk(ctx: RouteContext): Promise<Response> {
  const refused = await aiGate(ctx, 'storm');
  if (refused) return refused;
  const { request, env } = ctx;
  const started = Date.now();

  const tooLarge = () =>
    refuse(
      'board_too_large',
      413,
      `an ask reads a board of up to ${STORM_ASK_MAX_NOTES} notes, in a request of up to 1 MB`,
    );
  if (Number(request.headers.get('Content-Length')) > STORM_ASK_MAX_BYTES) return tooLarge();
  const text = await request.text();
  if (new TextEncoder().encode(text).length > STORM_ASK_MAX_BYTES) return tooLarge();
  let body: Partial<StormAskRequest> | null = null;
  try {
    body = JSON.parse(text) as Partial<StormAskRequest> | null;
  } catch {
    // Answered below, as a body that holds no board.
  }
  if (!isValidTab(body?.tab) || !isEventStormingTab(body.tab))
    return refuse('not_event_storming', 400, 'an ask reads an Event Storming board');
  const tab = boardOf(body.tab);
  const { topic, scope } = body;
  if (!isAskTopic(topic)) return refuse('topic_invalid', 400, 'topic is one of the asks');
  if (!isAskScope(scope) || !askFits(topic, scope) || !askScopeHolds(scope, tab.elements))
    return refuse(
      'scope_invalid',
      400,
      'scope fits the topic and names notes or contexts the board holds',
    );
  const lanes = topic === 'lanes' ? body.lanes : undefined;
  const lanesFit = Number.isInteger(lanes) && lanes! >= LANES_MIN && lanes! <= LANES_MAX;
  if (topic === 'lanes' && !lanesFit)
    return refuse('lanes_invalid', 400, `lanes is a whole number, ${LANES_MIN} to ${LANES_MAX}`);
  const notes = tab.elements.filter(
    (el) => eventStormingKindOf(el) !== null && !isSuggestion(el),
  ).length;
  if (notes > STORM_ASK_MAX_NOTES) return tooLarge();

  // The gate has already refused a deployment with no usable provider.
  const provider = resolveAiProvider(env, 'storm')!;
  const asked = { topic, scope, lanes, tab };
  const dropped = (code: string) => console.info('[storm] ask line dropped', { code });
  let answered = await askModelLines(provider, askMessages(asked));
  if (!answered) return refuse('ai_failed', 502, 'the model did not answer the ask');
  let run = runAskLines(tab, answered, { dropped });
  const counted = { lines: run.lines, dropped: run.dropped };
  let folded: StormAskResponse['folded'];

  // A lane plan is all or none: refused, the model is asked again with the refusal; refused again, the fold.
  if (topic === 'lanes' && !run.planned) {
    for (let retry = 0; retry < STORM_ASK_RETRIES && answered && !run.planned; retry += 1) {
      const said = answered.filter((line): line is string => typeof line === 'string');
      const refusal = { lines: said, why: run.refusal ?? NO_LANE_LINE };
      answered = await askModelLines(provider, askMessages({ ...asked, refused: refusal }));
      if (!answered) break;
      run = runAskLines(run.tab, answered, { dropped });
      counted.lines += run.lines;
      counted.dropped += run.dropped;
    }
    if (!run.planned) {
      const fold = foldPlan(run.tab, lanes!, { id: crypto.randomUUID(), reason: FOLD_REASON });
      folded = 'plan' in fold ? true : fold.none;
      if ('plan' in fold)
        run = { ...run, tab: { ...run.tab, elements: withLanePlan(run.tab.elements, fold.plan) } };
    }
  }

  const answer = askAnswerOf(tab.elements, run.tab.elements);
  console.info('[storm] ask', {
    topic,
    scope: scope.type,
    notes,
    ...counted,
    added: answer.added.length + answer.names.length + answer.changes.length,
    folded: folded ?? false,
    ms: Date.now() - started,
  });
  return json({
    ...answer,
    ...counted,
    ...(folded !== undefined ? { folded } : {}),
  } satisfies StormAskResponse);
}
