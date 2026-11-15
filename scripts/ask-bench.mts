// Benchmarking the ASK BRIEFS with the built-in model (docs/specs/021-event-storming/asks.md "What a model is told").
//
// A script, not a test: it asks a real model, which costs money and answers differently each time, so nothing here
// can run in CI. It exists so a brief stays a MEASUREMENT rather than a belief: each topic is asked over the seeded
// boards, every answered line runs through the edit-operation engine exactly as the route runs it, and the score is
// the share of lines the engine takes. A brief line earns its place while removing it scores worse.
//
//   GOOGLE_AI_STUDIO_API_KEY=... pnpm bench:asks [--topic <topic>] [--runs 3] [--lanes 2] [--model <id>]
//                                                 [--without <n>] [--board <tab.json>] [--show]
//
// `--without <n>` asks with the n-th statement of the topic's brief taken out (it needs `--topic`): run it beside a
// plain run and compare the shares. `--board` benches a board of your own (a tab's JSON, or a document's, whose
// first Event Storming tab is taken): it is read and never written, and the report holds counts and refusal codes
// alone, never a board's words. `--show` prints what the model would be sent and asks nothing.
//
// The model is the one an ask runs on: the provider's small model, or `--model` (as `AI_STORM_MODEL` names another
// on a deployment). The key is read from the same variables the api reads.
import { readFileSync } from 'node:fs';
import {
  candidateContexts,
  isEventStormingTab,
  isKeptContext,
  isValidTab,
  newContextElement,
  type Element,
  type StickyElement,
  type Tab,
} from '../packages/document/src';
import {
  ASK_BRIEFS,
  STORM_ASK_TOPICS,
  askMessages,
  isAskTopic,
  type AskScope,
  type StormAskTopic,
} from '../packages/storm-reading/src';
import { resolveAiProvider } from '../apps/api/src/ai-provider';
import { runAskLines } from '../apps/api/src/storm-ask';
import { kitchen, note } from '../apps/api/src/storm-ask.fixture';
import { askModelLines } from '../apps/api/src/storm-ask-model';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

// ---------------------------------------------------------------------------
// The seeded boards. Invented; no one's board.

// An online shop's order flow: two kept contexts, an open question, no unhappy path, and one fact worded as an
// intent, so every topic has something to find.
function orderFlow(): Tab {
  const notes = [
    note('customer', 'actor', 0, 0, 'Customer'),
    note('place-order', 'command', 0, 1, 'Place Order'),
    note('order-placed', 'domain-event', 0, 2, 'Order Placed'),
    note('reserve-stock', 'policy', 1, 3, 'Reserve Stock'),
    note('stock-reserved', 'domain-event', 2, 2, 'Stock Reserved'),
    note('take-payment', 'command', 3, 1, 'Take Payment'),
    note('payment-taken', 'domain-event', 3, 2, 'Payment Taken'),
    note('card-refused', 'hotspot', 4, 2, 'What if the card is refused?'),
    note('send-confirmation', 'domain-event', 5, 2, 'Send Confirmation'),
    note('picker', 'actor', 6, 0, 'Picker'),
    note('pick-parcel', 'command', 6, 1, 'Pick Parcel'),
    note('parcel-picked', 'domain-event', 6, 2, 'Parcel Picked'),
    note('ship-parcel', 'command', 7, 1, 'Ship Parcel'),
    note('parcel-shipped', 'domain-event', 7, 2, 'Parcel Shipped'),
  ] as StickyElement[];
  const held = (ids: string[]) => notes.filter((n) => ids.includes(n.id));
  return {
    id: 'order-flow',
    name: 'Order flow',
    kind: 'event-storming',
    esAbout: 'An online shop that sells and ships parcels. Customers pay by card.',
    elements: [
      ...notes,
      newContextElement({
        id: 'ordering',
        name: 'Ordering',
        notes: held(['customer', 'place-order', 'order-placed']),
      }),
      newContextElement({
        id: 'warehouse',
        name: 'Warehouse',
        notes: held(['picker', 'pick-parcel', 'parcel-picked', 'ship-parcel', 'parcel-shipped']),
      }),
    ],
  };
}

function ownBoard(path: string): Tab {
  const read = JSON.parse(readFileSync(path, 'utf8')) as { tabs?: unknown[] } | null;
  const tab = Array.isArray(read?.tabs)
    ? read.tabs.find((t) => isValidTab(t) && isEventStormingTab(t))
    : read;
  if (!isValidTab(tab) || !isEventStormingTab(tab))
    return fail(`${path} holds no Event Storming tab`);
  return tab;
}

// ---------------------------------------------------------------------------
// The asks: every topic the board's contexts allow, each about the widest scope it takes.

type Ask = { topic: StormAskTopic; scope: AskScope; lanes?: number };

function asksFor(elements: readonly Element[], lanes: number): Ask[] {
  const kept = candidateContexts(elements)
    .filter(isKeptContext)
    .map((c) => c.id);
  const board: AskScope = { type: 'board' };
  const asks: Ask[] = [
    { topic: 'gaps', scope: board },
    { topic: 'contexts', scope: board },
    { topic: 'wording', scope: board },
    { topic: 'lanes', scope: board, lanes },
  ];
  if (kept.length >= 1) asks.push({ topic: 'names', scope: { type: 'context', id: kept[0]! } });
  if (kept.length >= 2) asks.push({ topic: 'merge', scope: { type: 'contexts', ids: kept } });
  return asks;
}

// A brief's statements: a statement may run over several lines, and ends on a full stop.
const statementsOf = (brief: string) => brief.split(/(?<=\.)\n/);

function messagesFor(ask: Ask, tab: Tab, without: number | undefined) {
  const messages = askMessages({ ...ask, tab });
  if (without === undefined) return messages;
  const brief = ASK_BRIEFS[ask.topic];
  const kept = statementsOf(brief)
    .filter((_, i) => i !== without - 1)
    .join('\n');
  return messages.map((said, i) =>
    i === 0 ? { ...said, content: said.content.replace(brief, kept) } : said,
  );
}

// ---------------------------------------------------------------------------
// The score: lines answered, lines the engine took, and why the others were dropped.

type Score = {
  runs: number;
  unanswered: number;
  lines: number;
  taken: number;
  planned: number;
  codes: Map<string, number>;
};

const emptyScore = (): Score => ({
  runs: 0,
  unanswered: 0,
  lines: 0,
  taken: 0,
  planned: 0,
  codes: new Map(),
});

const share = (score: Score) =>
  score.lines === 0 ? 'n/a' : `${Math.round((100 * score.taken) / score.lines)}%`;

const codesOf = (score: Score) =>
  [...score.codes]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => `${code} ${count}`)
    .join(', ');

function row(board: string, topic: string, score: Score, lanes: boolean) {
  const answered = score.runs - score.unanswered;
  return `| ${[
    board,
    topic,
    `${answered}/${score.runs}`,
    score.lines,
    score.taken,
    share(score),
    lanes ? `${score.planned}/${score.runs}` : '',
    codesOf(score),
  ].join(' | ')} |`;
}

async function main() {
  const topic = arg('topic');
  if (topic !== undefined && !isAskTopic(topic))
    fail(`--topic is one of ${STORM_ASK_TOPICS.join(', ')}`);
  const runs = Number(arg('runs') ?? 3);
  const lanes = Number(arg('lanes') ?? 2);
  const without = arg('without') === undefined ? undefined : Number(arg('without'));
  if (without !== undefined) {
    if (!isAskTopic(topic))
      return fail('--without needs --topic: a statement belongs to one brief');
    const statements = statementsOf(ASK_BRIEFS[topic]);
    if (!Number.isInteger(without) || without < 1 || without > statements.length)
      return fail(`--without is 1 to ${statements.length} for ${topic}`);
    console.log(`without statement ${without} of ${topic}: ${statements[without - 1]}\n`);
  }
  const own = arg('board');
  // A person's own board is named by its place in the run, never by its name: the report may be pasted anywhere.
  const boards: [string, Tab][] = own
    ? [['own board', ownBoard(own)]]
    : [
        ['kitchen', kitchen()],
        ['order flow', orderFlow()],
      ];

  if (flag('show')) {
    for (const [name, tab] of boards)
      for (const ask of asksFor(tab.elements, lanes)) {
        if (topic !== undefined && ask.topic !== topic) continue;
        console.log(`===== ${name} · ${ask.topic}`);
        for (const said of messagesFor(ask, tab, without))
          console.log(`--- ${said.role}\n${said.content}\n`);
      }
    return;
  }

  const env = { ...process.env, ...(arg('model') ? { AI_STORM_MODEL: arg('model') } : {}) };
  const provider = resolveAiProvider(env as Parameters<typeof resolveAiProvider>[0], 'storm');
  if (!provider)
    return fail(
      'No model to ask: set GOOGLE_AI_STUDIO_API_KEY, OPENAI_API_KEY, or AI_API_KEY with AI_BASE_URL and AI_MODEL.',
    );
  console.log(`asking ${provider.model} (${provider.provider}), ${runs} runs an ask…\n`);

  const total = emptyScore();
  const rows: string[] = [];
  for (const [name, tab] of boards)
    for (const ask of asksFor(tab.elements, lanes)) {
      if (topic !== undefined && ask.topic !== topic) continue;
      const score = emptyScore();
      for (let run = 0; run < runs; run += 1) {
        score.runs += 1;
        const answered = await askModelLines(provider, messagesFor(ask, tab, without));
        if (!answered) {
          score.unanswered += 1;
          continue;
        }
        const ran = runAskLines(tab, answered, {
          dropped: (code) => score.codes.set(code, (score.codes.get(code) ?? 0) + 1),
        });
        score.lines += ran.lines;
        score.taken += ran.lines - ran.dropped;
        if (ran.planned) score.planned += 1;
      }
      rows.push(row(name, ask.topic, score, ask.topic === 'lanes'));
      total.runs += score.runs;
      total.unanswered += score.unanswered;
      total.lines += score.lines;
      total.taken += score.taken;
      for (const [code, count] of score.codes)
        total.codes.set(code, (total.codes.get(code) ?? 0) + count);
    }

  console.log('| board | topic | answered | lines | taken | share | planned | dropped as |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const line of rows) console.log(line);
  console.log(row('all', '', total, false));
}

await main();
