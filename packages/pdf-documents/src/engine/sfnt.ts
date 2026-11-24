// A TrueType font's tables (docs/specs/035-pdf-documents/marks.md "Words in every script"): read from an sfnt, the
// few numbers a PDF's font dictionaries say of a face, and an sfnt built back from tables. Only what LiveDoc's own
// mark faces hold is read: TrueType outlines (`glyf`), a Unicode `cmap` of format 4 or 12. Pure.

export type SfntTables = ReadonlyMap<string, Uint8Array>;

/** What a PDF's font descriptor says of a face, in thousandths of its size. */
export type FaceMetrics = {
  readonly unitsPerEm: number;
  readonly bbox: readonly [number, number, number, number];
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly postScriptName: string;
};

/** The sfnt of TrueType outlines, as its first four bytes say it. */
export const TRUETYPE = 0x00010000;

const view = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const tagOf = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);

const table = (tables: SfntTables, tag: string): DataView => {
  const bytes = tables.get(tag);
  if (!bytes) throw new Error(`the face has no ${tag} table`);
  return view(bytes);
};

/** A table's checksum: its bytes summed as 32-bit words, the last padded with zeros. */
export function checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let at = 0; at < bytes.length; at += 4) {
    const word =
      (bytes[at]! << 24) |
      ((bytes[at + 1] ?? 0) << 16) |
      ((bytes[at + 2] ?? 0) << 8) |
      (bytes[at + 3] ?? 0);
    sum = (sum + word) >>> 0;
  }
  return sum;
}

export const Sfnt = {
  /** An sfnt's tables by tag. */
  tables: (bytes: Uint8Array): SfntTables => {
    const data = view(bytes);
    const count = data.getUint16(4);
    const tables = new Map<string, Uint8Array>();
    for (let n = 0; n < count; n += 1) {
      const entry = 12 + n * 16;
      const offset = data.getUint32(entry + 8);
      tables.set(tagOf(bytes, entry), bytes.subarray(offset, offset + data.getUint32(entry + 12)));
    }
    return tables;
  },

  /** An sfnt of TrueType outlines holding `tables`, in tag order, each on a four-byte boundary, `head` adjusted. */
  build: (tables: SfntTables): Uint8Array<ArrayBuffer> => {
    const tags = [...tables.keys()].sort();
    const count = tags.length;
    const power = 2 ** Math.floor(Math.log2(count));
    const padded = (length: number) => (length + 3) & ~3;
    let offset = 12 + count * 16;
    const total = tags.reduce((sum, tag) => sum + padded(tables.get(tag)!.length), offset);
    const bytes = new Uint8Array(total);
    const data = view(bytes);
    data.setUint32(0, TRUETYPE);
    data.setUint16(4, count);
    data.setUint16(6, power * 16);
    data.setUint16(8, Math.log2(power));
    data.setUint16(10, count * 16 - power * 16);
    let head = -1;
    tags.forEach((tag, n) => {
      const body = tables.get(tag)!;
      const entry = 12 + n * 16;
      for (let at = 0; at < 4; at += 1) bytes[entry + at] = tag.charCodeAt(at);
      bytes.set(body, offset);
      if (tag === 'head') {
        head = offset;
        // The whole font's adjustment is worked out with the table's own taken as zero.
        data.setUint32(offset + 8, 0);
      }
      data.setUint32(entry + 4, checksum(bytes.subarray(offset, offset + body.length)));
      data.setUint32(entry + 8, offset);
      data.setUint32(entry + 12, body.length);
      offset += padded(body.length);
    });
    if (head >= 0) data.setUint32(head + 8, (0xb1b0afba - checksum(bytes)) >>> 0);
    return bytes;
  },

  /** How many glyphs the face holds. */
  glyphCount: (tables: SfntTables): number => table(tables, 'maxp').getUint16(4),

  /** Each glyph's advance, in the face's units, by glyph id. */
  advances: (tables: SfntTables): readonly number[] => {
    const metrics = table(tables, 'hmtx');
    const long = table(tables, 'hhea').getUint16(34);
    return Array.from({ length: Sfnt.glyphCount(tables) }, (_, glyph) =>
      metrics.getUint16(Math.min(glyph, long - 1) * 4),
    );
  },

  /** The glyph each character is drawn with, from the face's Unicode character map (format 4 or 12). */
  characters: (tables: SfntTables): ReadonlyMap<number, number> => {
    const cmap = table(tables, 'cmap');
    const map = new Map<number, number>();
    const subtables = Array.from({ length: cmap.getUint16(2) }, (_, n) => ({
      platform: cmap.getUint16(4 + n * 8),
      encoding: cmap.getUint16(6 + n * 8),
      offset: cmap.getUint32(8 + n * 8),
    }));
    // The full repertoire where the face has one, else the Basic Multilingual Plane's.
    const unicode = (platform: number, encoding: number) =>
      (platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0;
    const chosen =
      subtables.find((s) => unicode(s.platform, s.encoding) && cmap.getUint16(s.offset) === 12) ??
      subtables.find((s) => unicode(s.platform, s.encoding) && cmap.getUint16(s.offset) === 4);
    if (!chosen) return map;
    const at = chosen.offset;
    if (cmap.getUint16(at) === 12) {
      const groups = cmap.getUint32(at + 12);
      for (let n = 0; n < groups; n += 1) {
        const group = at + 16 + n * 12;
        const first = cmap.getUint32(group);
        const last = cmap.getUint32(group + 4);
        const glyph = cmap.getUint32(group + 8);
        for (let code = first; code <= last; code += 1) map.set(code, glyph + code - first);
      }
      return map;
    }
    const segments = cmap.getUint16(at + 6) / 2;
    const ends = at + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let n = 0; n < segments; n += 1) {
      const end = cmap.getUint16(ends + n * 2);
      const start = cmap.getUint16(starts + n * 2);
      const delta = cmap.getUint16(deltas + n * 2);
      const range = cmap.getUint16(ranges + n * 2);
      for (let code = start; code <= end && code !== 0xffff; code += 1) {
        let glyph: number;
        if (range === 0) glyph = (code + delta) & 0xffff;
        else {
          const raw = cmap.getUint16(ranges + n * 2 + range + (code - start) * 2);
          glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
        }
        if (glyph !== 0) map.set(code, glyph);
      }
    }
    return map;
  },

  /** What a PDF's font descriptor says of the face, in thousandths of its size. */
  metrics: (tables: SfntTables): FaceMetrics => {
    const head = table(tables, 'head');
    const hhea = table(tables, 'hhea');
    const os2 = tables.has('OS/2') ? table(tables, 'OS/2') : null;
    const unitsPerEm = head.getUint16(18);
    const per = (units: number) => Math.round((units * 1000) / unitsPerEm);
    const ascent = per(hhea.getInt16(4));
    return {
      unitsPerEm,
      bbox: [
        per(head.getInt16(36)),
        per(head.getInt16(38)),
        per(head.getInt16(40)),
        per(head.getInt16(42)),
      ],
      ascent,
      descent: per(hhea.getInt16(6)),
      capHeight: os2 && os2.getUint16(0) >= 2 ? per(os2.getInt16(88)) : ascent,
      postScriptName: postScriptName(tables),
    };
  },
} as const;

/** The face's PostScript name (name 6), in the Windows table's UTF-16 or the Macintosh table's ASCII. */
function postScriptName(tables: SfntTables): string {
  const name = table(tables, 'name');
  const bytes = tables.get('name')!;
  const strings = name.getUint16(4);
  for (let n = 0; n < name.getUint16(2); n += 1) {
    const record = 6 + n * 12;
    if (name.getUint16(record + 6) !== 6) continue;
    const length = name.getUint16(record + 8);
    const start = strings + name.getUint16(record + 10);
    const wide = name.getUint16(record) === 3;
    const characters = wide
      ? Array.from({ length: length / 2 }, (_, at) => name.getUint16(start + at * 2))
      : Array.from(bytes.subarray(start, start + length));
    // A PDF name holds the visible ASCII but its own delimiters.
    return String.fromCharCode(...characters).replace(/[^!-~]|[()<>[\]{}/%#]/g, '');
  }
  return 'LiveDocMarkFace';
}
