// multipart/related bodies as Drive's upload endpoint takes them: a JSON metadata part, then the media part, whose
// bytes are kept as sent (an .xlsx is binary).

type MultipartPart = { contentType: string; body: string; bytes: Uint8Array };

// Latin-1 maps each byte to one character and back, so a body splits on its boundary without decoding it.
const asLatin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');
const fromLatin1 = (text: string) => new Uint8Array(Buffer.from(text, 'latin1'));

export function parseMultipartRelated(
  contentType: string,
  body: Uint8Array | string,
): MultipartPart[] {
  const m = /boundary="?([^";]+)"?/i.exec(contentType);
  if (!/^multipart\/related/i.test(contentType) || !m) {
    throw new Error(`fake-google: expected multipart/related, got ${contentType}`);
  }
  const boundary = `--${m[1]}`;
  const raw = asLatin1(typeof body === 'string' ? new TextEncoder().encode(body) : body);
  const parts: MultipartPart[] = [];
  for (const piece of raw.split(boundary).slice(1)) {
    if (piece.startsWith('--')) break;
    const chunk = piece.replace(/^\r?\n/, '');
    const split = /\r?\n\r?\n/.exec(chunk);
    if (!split) continue;
    const headers = chunk.slice(0, split.index);
    const bytes = fromLatin1(chunk.slice(split.index + split[0].length).replace(/\r?\n$/, ''));
    const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() ?? 'text/plain';
    parts.push({ contentType: type, body: new TextDecoder().decode(bytes), bytes });
  }
  return parts;
}
