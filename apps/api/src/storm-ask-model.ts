// The model's part of an ask (docs/specs/021-event-storming/asks.md "The built-in hand"): the deployment's small
// model is sent the brief, the reading and the ask, and answers lines. What it answers is only ever read as lines
// for the engine to check; the ask bench (scripts/ask-bench.mts) asks the same way.

import type { askMessages } from '@livedoc/storm-reading';
import { chatCompletions } from './ai-client';
import { extractJson } from './ai-json';
import type { ResolvedAiProvider } from './ai-provider';

// Room for thirty lines of two hundred characters, with as much again to spare. Safe range: 2,000 to 8,000.
export const STORM_ASK_MAX_TOKENS = 4000;

const ANSWER_SCHEMA = {
  name: 'ask_answer',
  strict: true,
  schema: {
    type: 'object',
    properties: { lines: { type: 'array', items: { type: 'string' } } },
    required: ['lines'],
    additionalProperties: false,
  },
};

// The lines the model answered, or null when it erred or answered something else.
export async function askModelLines(
  provider: ResolvedAiProvider,
  messages: ReturnType<typeof askMessages>,
): Promise<unknown[] | null> {
  let content: string;
  let finish: string;
  try {
    const res = await chatCompletions(provider, {
      model: provider.model,
      max_tokens: STORM_ASK_MAX_TOKENS,
      messages,
      // A strict schema where the provider is known to honour one, JSON mode elsewhere; the answer is checked
      // below either way.
      response_format: provider.strictSchema
        ? { type: 'json_schema', json_schema: ANSWER_SCHEMA }
        : { type: 'json_object' },
    });
    if (!res.ok) {
      console.error('[storm] ask model error', { status: res.status });
      return null;
    }
    const completion = await res.json<{
      choices?: { finish_reason?: string; message?: { content?: string } }[];
    }>();
    content = completion.choices?.[0]?.message?.content ?? '';
    finish = completion.choices?.[0]?.finish_reason ?? 'none';
  } catch (err) {
    console.error(
      '[storm] ask model unreachable',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
  const answer = extractJson(content) as { lines?: unknown } | null;
  const lines = Array.isArray(answer?.lines) ? (answer.lines as unknown[]) : null;
  // The words stay out of the log: an answer may quote the board.
  if (!lines) console.error('[storm] ask answer unreadable', { chars: content.length, finish });
  return lines;
}
