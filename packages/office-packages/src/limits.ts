// The budgets every package read runs under (docs/specs/020-import-export/office-packages.md "Reading a package",
// values in docs/specs/034-text-documents/standard-mapping.md "Limits"), checked before anything inflates.

/** An import's file, in bytes; past it, `package_too_large` before inflating. */
export const PACKAGE_MAX_BYTES = 100 * 1024 * 1024;
/** The byte budget across every entry of one import: the zip-bomb guard. */
export const PACKAGE_MAX_INFLATED_BYTES = 200 * 1024 * 1024;
/** Entries in one package. */
export const PACKAGE_MAX_ENTRIES = 5000;

/** The budgets one read runs under; tests pass smaller ones to prove each refusal. */
export type PackageBudgets = { bytes: number; inflatedBytes: number; entries: number };

export const PACKAGE_BUDGETS: PackageBudgets = {
  bytes: PACKAGE_MAX_BYTES,
  inflatedBytes: PACKAGE_MAX_INFLATED_BYTES,
  entries: PACKAGE_MAX_ENTRIES,
};
