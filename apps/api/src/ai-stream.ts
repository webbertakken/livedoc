// A streamed chat-completions answer read whole in the worker (docs/specs/007-editor/ai-assistance.md). A long
// answer is asked for as a stream so its headers arrive at once (the provider timeout bounds only the wait for
// them), then the text deltas are joined here. Lines that are not `data:` events, and events that carry no text,
// are skipped; a malformed event is skipped rather than failing the whole answer.
export async function readChatStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = '';
  let text = '';
  const take = (line: string) => {
    const data = line.startsWith('data:') ? line.slice(5).trim() : '';
    if (!data || data === '[DONE]') return;
    try {
      const event = JSON.parse(data) as { choices?: { delta?: { content?: unknown } }[] };
      const piece = event.choices?.[0]?.delta?.content;
      if (typeof piece === 'string') text += piece;
    } catch {
      // A malformed event: skipped.
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += value;
    const lines = buffered.split('\n');
    buffered = lines.pop()!;
    lines.forEach(take);
  }
  take(buffered);
  return text;
}
