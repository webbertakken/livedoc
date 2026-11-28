// A zip's entries by name, read in full: for tests of the files the writers zip (the Web Page, the EPUB).
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';

/** Every entry's bytes, in the zip's order. */
export async function unzipped(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const listed = listZip(bytes);
  if (!listed.ok) throw new Error(listed.refusal);
  const out = new Map<string, Uint8Array>();
  for (const entry of listed.entries) {
    const read = await readZipEntry(new Uint8Array(bytes), entry, new ByteBudget(50_000_000));
    if (!read.ok) throw new Error(read.refusal);
    out.set(entry.name, read.bytes);
  }
  return out;
}
