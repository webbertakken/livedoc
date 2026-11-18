// A package's entries read under the budgets (docs/specs/020-import-export/office-packages.md "Reading a package"
// steps 2, 3, 5 and 9), for both formats: names checked as keys, encrypted entries refused, what may run dropped by
// the caller's patterns, and every picture's header checked before the read is accepted.
import { PACKAGE_BUDGETS, type PackageBudgets } from '../limits';
import { isSafeEntryName } from '../odf/entry-names';
import { isPictureTooLarge } from '../pictures';
import { refuse, type PackageRefusal } from '../rejections';
import { ByteBudget } from './inflate';
import { listZip, readZipEntry } from './zip-reader';

export type PackageEntries =
  { ok: true; entries: Map<string, Uint8Array>; dropped: string[] } | PackageRefusal;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export const startsWithZip = (bytes: Uint8Array): boolean =>
  ZIP_MAGIC.every((b, i) => bytes[i] === b);

/** Every entry of the zip, but the dropped ones (named in `dropped`), under the budgets. */
export async function readPackageEntries(
  bytes: Uint8Array<ArrayBuffer>,
  budgets: PackageBudgets = PACKAGE_BUDGETS,
  drop: readonly RegExp[] = [],
): Promise<PackageEntries> {
  if (bytes.byteLength > budgets.bytes) return refuse('package_too_large');
  if (!startsWithZip(bytes)) return refuse('package_damaged');
  const listed = listZip(bytes);
  if (!listed.ok) return refuse('package_damaged');
  if (listed.entries.length > budgets.entries) return refuse('package_too_large');
  const budget = new ByteBudget(budgets.inflatedBytes);
  const entries = new Map<string, Uint8Array>();
  const dropped: string[] = [];
  for (const entry of listed.entries) {
    if (!isSafeEntryName(entry.name)) return refuse('package_damaged', { entry: entry.name });
    if (entry.name.endsWith('/')) continue;
    if (drop.some((pattern) => pattern.test(entry.name))) {
      dropped.push(entry.name);
      continue;
    }
    if (entry.encrypted) return refuse('package_encrypted', { entry: entry.name });
    const read = await readZipEntry(bytes, entry, budget);
    if (!read.ok) {
      const rejection = read.refusal === 'too-large' ? 'package_too_large' : 'package_damaged';
      return refuse(rejection, { entry: entry.name });
    }
    if (isPictureTooLarge(read.bytes)) return refuse('picture_too_large', { entry: entry.name });
    entries.set(entry.name, read.bytes);
  }
  return { ok: true, entries, dropped };
}
