// The built-in hand's engine run (docs/specs/021-event-storming/asks.md "The built-in hand"): the model words, the
// engine checks. Each line the model answered runs through the edit-operation engine alone, against the board the
// lines before it left, so one refused line costs that line; the lane lines run last as one changeset, since a lane
// plan is all or none. What is no suggest line, does not parse or is refused is dropped and counted. Pure.

import type { Tab } from '@livedoc/document';
import {
  applyEditOperations,
  formatRejections,
  parseEditOperations,
  type EditOperation,
} from '@livedoc/edit-operations';
import { STORM_ASKS } from '@livedoc/storm-reading';

// As many lines as a changeset of suggestions holds (`SUGGEST_NOTES_MAX`). Safe range: 10 to 60.
export const STORM_ASK_MAX_LINES = 30;

/** Who the built-in hand's suggestions are by. */
export const ASK_BY = 'Built-in model';

const SUGGEST_FAMILY: ReadonlySet<string> = new Set(
  Object.values(STORM_ASKS).flatMap((ask) => ask.operations),
);

export type AskRun = {
  // The board with every line that was taken.
  tab: Tab;
  // How many lines the model answered, and how many were not taken.
  lines: number;
  dropped: number;
  // Whether the lane lines made a plan, and, when the board refused them, why in its own words.
  planned: boolean;
  refusal: string | null;
};

type RunOptions = {
  // Told why each line (or the plan's lines together) was dropped.
  dropped?: (code: string) => void;
};

// One line as its one suggest operation, else why it is dropped.
function operationOf(line: unknown): EditOperation | string {
  if (typeof line !== 'string') return 'not_a_line';
  const parsed = parseEditOperations(line);
  if ('errors' in parsed) return parsed.errors[0]!.code;
  const [operation, ...more] = parsed.operations;
  if (!operation || more.length > 0) return 'not_one_line';
  return SUGGEST_FAMILY.has(operation.op) ? operation : 'not_a_suggestion';
}

export function runAskLines(tab: Tab, lines: readonly unknown[], options: RunOptions = {}): AskRun {
  const read = lines.slice(0, STORM_ASK_MAX_LINES);
  let working = tab;
  let dropped = 0;
  const drop = (code: string, count = 1) => {
    dropped += count;
    options.dropped?.(code);
  };
  if (lines.length > read.length) drop('too_many_lines', lines.length - read.length);
  const apply = (operations: EditOperation[]) =>
    applyEditOperations(working, operations, { agentName: ASK_BY });

  const laneLines: EditOperation[] = [];
  for (const line of read) {
    const operation = operationOf(line);
    if (typeof operation === 'string') {
      drop(operation);
      continue;
    }
    if (operation.op === 'suggest-lane') {
      laneLines.push(operation);
      continue;
    }
    const outcome = apply([operation]);
    if ('errors' in outcome) drop(outcome.errors[0]!.code);
    else working = outcome.tab;
  }

  const run = { lines: lines.length, planned: false, refusal: null };
  if (laneLines.length === 0) return { ...run, tab: working, dropped };
  const outcome = apply(laneLines);
  if ('errors' in outcome) {
    drop(outcome.errors[0]!.code, laneLines.length);
    // The refusal as an agent reads it, without its footer: nothing here was a changeset of the model's.
    const refusal = formatRejections(outcome.errors).slice(0, -1).join('\n');
    return { ...run, tab: working, dropped, refusal };
  }
  return { ...run, tab: outcome.tab, dropped, planned: true };
}
