// Entry names are keys, never paths (docs/specs/020-import-export/office-packages.md "Reading a package" step 5).

/** Whether a package entry's name is safe to hold: no `..`, no leading `/`, no backslash, no drive letter. */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.startsWith('/') || name.includes('\\')) return false;
  if (/^[A-Za-z]:/.test(name)) return false;
  return !name.split('/').some((part) => part === '..');
}
