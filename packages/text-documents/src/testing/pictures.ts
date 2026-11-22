// Pictures for tests: whole PNGs of one colour, built in plain code (zlib's stored blocks, no compression), so another
// suite opens the files the constructs write with real pictures in them. Test-only; never shipped.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: readonly number[]): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function chunk(type: string, data: readonly number[]): number[] {
  const body = [...ascii(type), ...data];
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** Zlib around stored blocks of at most 65,535 bytes each. */
function stored(raw: readonly number[]): number[] {
  const out = [0x78, 0x01];
  for (let at = 0; at < raw.length || at === 0; at += 0xffff) {
    const block = raw.slice(at, at + 0xffff);
    const last = at + 0xffff >= raw.length ? 1 : 0;
    out.push(
      last,
      block.length & 255,
      block.length >> 8,
      ~block.length & 255,
      (~block.length >> 8) & 255,
    );
    out.push(...block);
    if (raw.length === 0) break;
  }
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return [...out, ...u32(((b << 16) | a) >>> 0)];
}

/** A PNG of `width` × `height` pixels of one colour, `[r, g, b]`. */
export function solidPng(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): Uint8Array {
  const raw: number[] = [];
  for (let y = 0; y < height; y += 1) {
    raw.push(0);
    for (let x = 0; x < width; x += 1) raw.push(...rgb);
  }
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...u32(width), ...u32(height), 8, 2, 0, 0, 0]),
    ...chunk('IDAT', stored(raw)),
    ...chunk('IEND', []),
  ]);
}

/** A green picture of 130 × 92 pixels: 97.5 × 69 pt at 96 an inch. */
export const GREEN_PNG = solidPng(130, 92, [0x6a, 0xa8, 0x4f]);
/** Its media key, the SHA-256 of its bytes (proven in pictures-files.test.ts). */
export const GREEN_PNG_KEY = '81a78c276d8d4fdbeda7b323f4a367e5c47d8f08fef76dc91a7f250432bdd794';

/** A blue picture of 40 × 40 pixels. */
export const BLUE_PNG = solidPng(40, 40, [0x3d, 0x85, 0xc6]);
export const BLUE_PNG_KEY = 'd75ad63062ac9dec8d36fbd1f1019962920af65945931704836efb1d782c2299';
