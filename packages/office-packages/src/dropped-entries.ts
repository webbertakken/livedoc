// What a dropped package entry was (docs/specs/020-import-export/office-packages.md "Reading a package" step 8), so a
// report can say it in words: macros and scripts, a digital signature, an embedded program, or the file's preview.
// Every entry an ODF or OOXML read drops is one of these (odf-package.ts, ooxml-package.ts).

export type DroppedEntryKind = 'macros' | 'signature' | 'object' | 'thumbnail';

const KINDS: readonly [RegExp, DroppedEntryKind][] = [
  [/(^|\/)(documentsignatures\.xml$|_xmlsignatures\/)/, 'signature'],
  [/^Thumbnails\/|^docProps\/thumbnail\./, 'thumbnail'],
  [/(^|\/)activeX\/|(^|\/)embeddings\/oleObject/, 'object'],
];

/** The kind of a dropped entry by its name; what may run (Basic, Scripts, a VBA project) is the rest. */
export function droppedEntryKind(name: string): DroppedEntryKind {
  return KINDS.find(([pattern]) => pattern.test(name))?.[1] ?? 'macros';
}
