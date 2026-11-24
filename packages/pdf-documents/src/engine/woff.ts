// A WOFF file as the sfnt it wraps (docs/specs/035-pdf-documents/marks.md "Words in every script"): the mark faces are
// served as WOFF 1.0, each table zlib-compressed where that made it smaller, and a PDF embeds the plain TrueType. Runs
// where a browser or Node does: the decompression is the platform's own.
import { Sfnt, type SfntTables } from './sfnt';

/** The four bytes a WOFF 1.0 file starts with: `wOFF`. */
const WOFF = 0x774f4646;

/** The file is not a WOFF 1.0 file: a failure with a name of its own, since only a failure's name is logged. */
export class NotWoff extends Error {
  override readonly name = 'NotWoff';
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A WOFF 1.0 file's tables, each as the sfnt holds it. */
export async function woffTables(woff: Uint8Array<ArrayBuffer>): Promise<SfntTables> {
  const data = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (woff.byteLength < 44 || data.getUint32(0) !== WOFF) throw new NotWoff('not a WOFF 1.0 file');
  const count = data.getUint16(12);
  const entries = Array.from({ length: count }, (_, n) => {
    const entry = 44 + n * 20;
    return {
      tag: String.fromCharCode(...woff.subarray(entry, entry + 4)),
      offset: data.getUint32(entry + 4),
      stored: data.getUint32(entry + 8),
      length: data.getUint32(entry + 12),
    };
  });
  const tables = await Promise.all(
    entries.map(async ({ tag, offset, stored, length }) => {
      const body = woff.subarray(offset, offset + stored);
      return [tag, stored < length ? await inflate(body) : body] as const;
    }),
  );
  return new Map(tables);
}

/** A WOFF 1.0 file as the TrueType font it wraps. */
export async function sfntOfWoff(woff: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return Sfnt.build(await woffTables(woff));
}
