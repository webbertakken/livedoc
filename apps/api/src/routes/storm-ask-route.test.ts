import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORM_ASK_MAX_BYTES,
  STORM_ASK_MAX_NOTES,
  type StormAskRequest,
  type StormAskResponse,
} from '@livedoc/api-schema';
import { isLanePlan, newContextElement, type Element, type StickyElement } from '@livedoc/document';
import { ASK_BRIEFS, FOLD_BY, FOLD_REASON } from '@livedoc/storm-reading';
import { GOOGLE_DEFAULT_VISION_MODEL } from '../ai-provider';
import { ASK_BY } from '../storm-ask';
import { OUT_OF_REACH, TWO_LANES, kitchen, note } from '../storm-ask.fixture';
import type { Env } from '../types';
import { STORM_ASK_MAX_TOKENS, handleStormAsk } from './storm-ask-route';
import { makeTestRouteContext } from './test-route-context';

// The built-in hand's route (docs/specs/021-event-storming/asks.md "The built-in hand"): the gate, the refusals,
// what the model is sent, what comes back to add, and a lane plan asked for once more and then folded.

const KEY = { GOOGLE_AI_STUDIO_API_KEY: 'test-key' } as Env;
const GAP = 'suggest domain-event "Ticket Fired" after=fire-ticket reason="what the pass reports"';

const ask = (over: Partial<StormAskRequest> = {}): StormAskRequest => ({
  topic: 'gaps',
  scope: { type: 'board' },
  tab: kitchen(),
  ...over,
});

function post(body: unknown, opts: { env?: Env; rawBody?: string; owner?: string | null } = {}) {
  return handleStormAsk(
    makeTestRouteContext('POST', '/api/storm-ask', {
      env: opts.env ?? KEY,
      owner: opts.owner === undefined ? 'guest-1' : opts.owner,
      ...(opts.rawBody !== undefined ? { rawBody: opts.rawBody } : { body }),
    }),
  );
}

type Sent = {
  model: string;
  max_tokens: number;
  response_format: { type: string };
  messages: { role: string; content: string }[];
};
const sent: Sent[] = [];
const originalFetch = globalThis.fetch;
// Each call answers the next of these: lines, the raw content of the answer, or a status the provider failed with.
function modelSays(...answers: (string[] | string | number)[]) {
  sent.length = 0;
  globalThis.fetch = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    sent.push(JSON.parse(String(init?.body)) as Sent);
    const answer = answers.shift() ?? [];
    if (typeof answer === 'number') return new Response('nope', { status: answer });
    const content = typeof answer === 'string' ? answer : JSON.stringify({ lines: answer });
    return Response.json({ choices: [{ message: { content } }] });
  });
}

let infos: unknown[][] = [];
const quiet = () => {
  infos = [];
  vi.spyOn(console, 'info').mockImplementation((...args) => void infos.push(args));
  vi.spyOn(console, 'error').mockImplementation(() => {});
};
const logged = (tag: string) => infos.filter((args) => args[0] === tag).map((args) => args[1]);

const answerOf = (res: Response) => res.json<StormAskResponse>();
const refusalOf = async (res: Response) => [
  res.status,
  (await res.json<{ error: string }>()).error,
];

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('POST /api/storm-ask: who may ask', () => {
  it('is not offered on a deployment with no model', async () => {
    expect(await refusalOf(await post(ask(), { env: {} as Env }))).toEqual([
      503,
      'ai_not_configured',
    ]);
  });

  it('stands behind the gate of every model route', async () => {
    const env = { ...KEY, AI_REQUIRE_ACCOUNT: 'true' } as Env;
    expect(await refusalOf(await post(ask(), { env }))).toEqual([401, 'sign_in_required']);
    const limited = { ...KEY, AI_RATE_LIMITER: { limit: async () => ({ success: false }) } } as Env;
    expect(await refusalOf(await post(ask(), { env: limited }))).toEqual([429, 'rate_limited']);
  });
});

describe('POST /api/storm-ask: what it refuses', () => {
  it('reads an Event Storming board alone', async () => {
    quiet();
    modelSays();
    expect(await refusalOf(await post(null, { rawBody: 'not json' }))).toEqual([
      400,
      'not_event_storming',
    ]);
    expect(await refusalOf(await post({ topic: 'gaps' }))).toEqual([400, 'not_event_storming']);
    const plain = { ...kitchen(), kind: 'diagram' };
    expect(await refusalOf(await post(ask({ tab: plain })))).toEqual([400, 'not_event_storming']);
    const broken = {
      ...kitchen(),
      elements: [{ id: 'x', type: 'nonsense' }] as unknown as Element[],
    };
    expect(await refusalOf(await post(ask({ tab: broken })))).toEqual([400, 'not_event_storming']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(logged('[storm] ask refused')).toContainEqual({ error: 'not_event_storming' });
  });

  it('knows its topics', async () => {
    quiet();
    expect(await refusalOf(await post(ask({ topic: 'poetry' })))).toEqual([400, 'topic_invalid']);
  });

  it('takes a scope that is well formed, fits the topic and names what the board holds', async () => {
    quiet();
    const refused = async (over: unknown) =>
      refusalOf(await post(ask(over as Partial<StormAskRequest>)));
    expect(await refused({ scope: { type: 'notes', ids: [] } })).toEqual([400, 'scope_invalid']);
    expect(await refused({ scope: undefined })).toEqual([400, 'scope_invalid']);
    expect(
      await refused({ topic: 'lanes', lanes: 3, scope: { type: 'notes', ids: ['cook'] } }),
    ).toEqual([400, 'scope_invalid']);
    expect(await refused({ scope: { type: 'notes', ids: ['no-such-note'] } })).toEqual([
      400,
      'scope_invalid',
    ]);
  });

  it('wants a whole number of lanes from 2 to 12 for a lane plan', async () => {
    quiet();
    for (const lanes of [undefined, 1, 13, 2.5, '3'])
      expect(
        await refusalOf(await post(ask({ topic: 'lanes', lanes: lanes as number }))),
        String(lanes),
      ).toEqual([400, 'lanes_invalid']);
  });

  it('reads a board of up to four hundred notes, in a request of up to a megabyte', async () => {
    quiet();
    modelSays();
    const many = Array.from({ length: STORM_ASK_MAX_NOTES + 1 }, (_, i) =>
      note(`n${i}`, 'domain-event', i, 0, `Event ${i}`),
    );
    expect(await refusalOf(await post(ask({ tab: { ...kitchen(), elements: many } })))).toEqual([
      413,
      'board_too_large',
    ]);
    const heavy = ask({ tab: { ...kitchen(), esAbout: 'x'.repeat(STORM_ASK_MAX_BYTES) } });
    expect(await refusalOf(await post(heavy))).toEqual([413, 'board_too_large']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('POST /api/storm-ask: the answer', () => {
  it('sends the small model the brief, the board as the reading prints it and the ask', async () => {
    quiet();
    modelSays([GAP]);
    const tab = { ...kitchen(), esAbout: 'A restaurant kitchen at dinner service.' };
    const res = await post(ask({ tab, scope: { type: 'notes', ids: ['fire-ticket'] } }));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      model: GOOGLE_DEFAULT_VISION_MODEL,
      max_tokens: STORM_ASK_MAX_TOKENS,
      response_format: { type: 'json_schema' },
    });
    const [system, user] = sent[0]!.messages;
    expect(system!.content).toContain(ASK_BRIEFS.gaps);
    expect(user!.content).toContain('A restaurant kitchen at dinner service.');
    expect(user!.content).toContain('Suggest the notes missing round fire-ticket "Fire Ticket".');
  });

  it('asks in JSON mode where the provider’s schema support is not known', async () => {
    quiet();
    modelSays([]);
    const env = { AI_API_KEY: 'k', AI_BASE_URL: 'http://model.test/v1', AI_MODEL: 'local' } as Env;
    expect((await post(ask(), { env })).status).toBe(200);
    expect(sent[0]).toMatchObject({ model: 'local', response_format: { type: 'json_object' } });
  });

  it('answers what to add: the suggestions the engine took, by the built-in model', async () => {
    quiet();
    const pass = newContextElement({
      id: 'pass',
      name: 'Pass',
      notes: kitchen().elements.filter((el) => el.id === 'plate-dish') as StickyElement[],
    });
    modelSays([
      GAP,
      'suggest-name "The Pass" pass reason="what the cooks call it"',
      'suggest-reword order-taken "Order Received" reason="what the waiter says"',
      'rm cook',
    ]);
    const answer = await answerOf(await post(ask({ tab: kitchen([pass]) })));
    expect(answer).toMatchObject({ lines: 4, dropped: 1 });
    expect(answer.added).toMatchObject([{ label: 'Ticket Fired', esSuggestion: { by: ASK_BY } }]);
    expect(answer.names).toMatchObject([{ contexts: ['pass'], name: 'The Pass', by: ASK_BY }]);
    expect(answer.changes).toMatchObject([
      { note: 'order-taken', change: { words: 'Order Received' } },
    ]);
    expect(answer.folded).toBeUndefined();
    expect(logged('[storm] ask line dropped')).toEqual([{ code: 'not_a_suggestion' }]);
    expect(logged('[storm] ask')).toMatchObject([
      { topic: 'gaps', scope: 'board', notes: 7, lines: 4, dropped: 1, added: 3, folded: false },
    ]);
  });

  it('refuses what was declined before, as an agent’s line is', async () => {
    quiet();
    modelSays([GAP]);
    const esDeclined = [
      {
        type: 'note' as const,
        words: 'Ticket Fired',
        kind: 'domain-event' as const,
        about: ['fire-ticket'],
      },
    ];
    const answer = await answerOf(await post(ask({ tab: { ...kitchen(), esDeclined } })));
    expect(answer).toMatchObject({ added: [], lines: 1, dropped: 1 });
    expect(logged('[storm] ask line dropped')).toEqual([{ code: 'declined_before' }]);
  });

  it('answers nothing to add when the model had nothing to say', async () => {
    quiet();
    modelSays([]);
    expect(await answerOf(await post(ask()))).toEqual({
      added: [],
      names: [],
      changes: [],
      lines: 0,
      dropped: 0,
    });
  });

  it('fails as one refusal when the model errs or answers no such JSON', async () => {
    quiet();
    for (const answer of [400, 'I would rather not.', '{"lines": "none"}', '["a line"]']) {
      modelSays(answer);
      expect(await refusalOf(await post(ask())), String(answer)).toEqual([502, 'ai_failed']);
    }
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException('provider did not answer', 'TimeoutError');
    });
    expect(await refusalOf(await post(ask()))).toEqual([502, 'ai_failed']);
    globalThis.fetch = vi.fn(async () => new Response('not json'));
    expect(await refusalOf(await post(ask()))).toEqual([502, 'ai_failed']);
  });
});

describe('POST /api/storm-ask: a lane plan', () => {
  const lanes = (count: number, tab = kitchen()) => ask({ topic: 'lanes', lanes: count, tab });

  it('adds the model’s plan when the board would say the same', async () => {
    quiet();
    modelSays(TWO_LANES);
    const answer = await answerOf(await post(lanes(2)));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.messages[1]!.content).toContain('Reorganise this board into 2 lanes.');
    expect(answer).toMatchObject({ lines: 2, dropped: 0 });
    expect(answer.folded).toBeUndefined();
    expect(answer.added).toMatchObject([
      { esLanePlan: { by: ASK_BY, lanes: [{ name: 'Orders' }, { name: 'Pass' }] } },
    ]);
  });

  it('asks once more with the board’s refusal, and takes the second plan', async () => {
    quiet();
    modelSays(OUT_OF_REACH, TWO_LANES);
    const answer = await answerOf(await post(lanes(2)));
    expect(sent).toHaveLength(2);
    const again = sent[1]!.messages;
    expect(again).toHaveLength(4);
    expect(JSON.parse(again[2]!.content)).toEqual({ lines: OUT_OF_REACH });
    expect(again[3]!.content).toContain('reading_changes');
    expect(answer).toMatchObject({ lines: 6, dropped: 4 });
    expect(answer.folded).toBeUndefined();
    expect(answer.added.filter(isLanePlan)).toHaveLength(1);
  });

  it('asks once more when the answer held no lane line', async () => {
    quiet();
    modelSays([GAP], TWO_LANES);
    const answer = await answerOf(await post(lanes(2)));
    expect(sent[1]!.messages[3]!.content).toContain('suggest-lane');
    // What the first answer suggested stays.
    expect(answer.added).toMatchObject([{ label: 'Ticket Fired' }, { esLanePlan: {} }]);
  });

  it('offers the board’s own fold when the second plan is refused too', async () => {
    quiet();
    modelSays(OUT_OF_REACH, OUT_OF_REACH);
    const answer = await answerOf(await post(lanes(2)));
    expect(sent).toHaveLength(2);
    expect(answer).toMatchObject({ lines: 8, dropped: 8, folded: true });
    expect(answer.added).toMatchObject([{ esLanePlan: { by: FOLD_BY, reason: FOLD_REASON } }]);
    expect(answer.added.filter(isLanePlan)[0]?.esLanePlan.lanes).toHaveLength(2);
    expect(logged('[storm] ask')).toMatchObject([{ topic: 'lanes', folded: true, added: 1 }]);
  });

  it('folds too when the model does not answer the second time', async () => {
    quiet();
    modelSays(OUT_OF_REACH, 400);
    expect(await answerOf(await post(lanes(2)))).toMatchObject({
      lines: 4,
      dropped: 4,
      folded: true,
    });
  });

  it('says why there is no fold, and adds nothing', async () => {
    quiet();
    modelSays(OUT_OF_REACH, OUT_OF_REACH);
    expect(await answerOf(await post(lanes(4)))).toMatchObject({ added: [], folded: 'fits' });
    // Two commands one above the other, each beside its own event: on one lane either would cause the other's.
    const stacked = {
      ...kitchen(),
      elements: [
        note('pay', 'command', 0, 0, 'Pay'),
        note('paid', 'domain-event', 1, 0, 'Paid'),
        note('ship', 'command', 0, 1, 'Ship'),
        note('shipped', 'domain-event', 1, 1, 'Shipped'),
        note('pack', 'command', 0, 2, 'Pack'),
        note('packed', 'domain-event', 1, 2, 'Packed'),
      ],
    };
    modelSays([], []);
    expect(await answerOf(await post(lanes(2, stacked)))).toMatchObject({
      added: [],
      folded: 'no_arrangement',
    });
  });
});
