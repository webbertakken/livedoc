import { describe, expect, it } from 'vitest';
import { readChatStream } from './ai-stream';

const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });

const event = (content: unknown) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;

describe('readChatStream', () => {
  it('joins the text deltas, across chunk boundaries', async () => {
    const all = `${event('{"files"')}${event(': []}')}data: [DONE]\n`;
    const text = await readChatStream(streamOf(all.slice(0, 20), all.slice(20)));
    expect(text).toBe('{"files": []}');
  });

  it('skips comments, empty events, deltas without text and malformed events', async () => {
    const text = await readChatStream(
      streamOf(
        ': keep-alive\n',
        'data:\n',
        event(null),
        'data: {nope\n',
        `data: ${JSON.stringify({})}\n`,
        event('ok'),
      ),
    );
    expect(text).toBe('ok');
  });

  it('reads a last event with no newline after it', async () => {
    const last = event('end').trimEnd();
    expect(await readChatStream(streamOf(last))).toBe('end');
  });
});
