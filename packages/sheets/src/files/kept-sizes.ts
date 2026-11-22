// The sizes of kept content a spreadsheet stores (docs/specs/029-sheets/standard-mapping.md "Unknown content", D113):
// what a file's kept content weighs, and the content fitted to the sizes before it is sent, what is past them left out
// and counted, never silently. The api weighs what arrives the same way.
import { resolvePartName } from '@livedoc/office-packages';
import type { KeptContent, KeptItem, KeptPart, KeptRelationship } from './kept-content';

const MB = 1024 * 1024;

/** The most kept content one spreadsheet stores, in bytes (D113). */
export const KEPT_MAX_BYTES = 16 * MB;
/** The most one kept element or attribute weighs (D113). */
export const KEPT_ITEM_MAX_BYTES = MB;
/** The most one kept package entry weighs (D113). */
export const KEPT_PART_MAX_BYTES = 5 * MB;

const utf8 = new TextEncoder();
const textBytes = (text: string): number => utf8.encode(text).byteLength;

/** What a kept item weighs: its XML and its bindings. */
export const keptItemBytes = (item: KeptItem<unknown>): number =>
  textBytes(item.xml) + textBytes(JSON.stringify(item.ns));

/** What a kept relationship weighs: its id, type and target. */
export const keptRelationshipBytes = (rel: KeptRelationship<unknown>): number =>
  textBytes(rel.id) + textBytes(rel.type) + textBytes(rel.target);

/** What a kept entry weighs: its bytes, its name and type, and its own relationships. */
export const keptPartBytes = (part: KeptPart): number =>
  part.data.byteLength +
  textBytes(part.name) +
  textBytes(part.type) +
  part.rels.reduce(
    (n, rel) => n + textBytes(rel.id) + textBytes(rel.type) + textBytes(rel.target),
    0,
  );

/** What kept content weighs in all. */
export function keptBytes(kept: KeptContent<unknown>): number {
  return (
    kept.items.reduce((n, item) => n + keptItemBytes(item), 0) +
    kept.relationships.reduce((n, rel) => n + keptRelationshipBytes(rel), 0) +
    kept.parts.reduce((n, part) => n + keptPartBytes(part), 0)
  );
}

// The part an internal relationship names: a kept one's target is the part's name, `/`-led; an entry's own is
// resolved against the entry.
const targetOf = (
  source: string,
  rel: { target: string; external?: boolean },
): string | undefined => (rel.external ? undefined : resolvePartName(source, rel.target));

/** Kept content fitted to the sizes (D113), and how many of its items, relationships and entries were left out. */
export function keptWithinSizes<At>(kept: KeptContent<At>): {
  kept: KeptContent<At>;
  left: number;
} {
  let items = kept.items.filter((item) => keptItemBytes(item) <= KEPT_ITEM_MAX_BYTES);
  const parts = kept.parts.filter((part) => keptPartBytes(part) <= KEPT_PART_MAX_BYTES);
  let relationships = kept.relationships;
  let total = keptBytes({ ...kept, items, parts });
  // Entries go first, the largest first; then items from the last.
  const bySize = [...parts].sort((a, b) => keptPartBytes(b) - keptPartBytes(a));
  for (const part of bySize) {
    if (total <= KEPT_MAX_BYTES) break;
    parts.splice(parts.indexOf(part), 1);
    total -= keptPartBytes(part);
  }
  while (total > KEPT_MAX_BYTES && items.length > 0) {
    total -= keptItemBytes(items.at(-1)!);
    items = items.slice(0, -1);
  }
  // Relationships naming an entry left out go with it.
  const names = new Set(parts.map((part) => part.name));
  const goneNames = new Set(kept.parts.filter((p) => !names.has(p.name)).map((p) => p.name));
  relationships = relationships.filter((rel) => {
    const target = targetOf('', rel);
    return target === undefined || !goneNames.has(target);
  });
  const fitted = parts.map((part) => {
    const rels = part.rels.filter((rel) => {
      const target = targetOf(part.name, rel);
      return target === undefined || !goneNames.has(target);
    });
    return rels.length === part.rels.length ? part : { ...part, rels };
  });
  const left =
    kept.items.length -
    items.length +
    (kept.relationships.length - relationships.length) +
    (kept.parts.length - parts.length);
  return { kept: { ...kept, items, parts: fitted, relationships }, left };
}
