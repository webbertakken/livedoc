// Comparing documents in tests: the model as read, without what was kept from the file and with list ids numbered by
// first use, so a document written and read back can be compared with the one written. Test-only.
import { canonical } from '../model/props';
import type { TextDocument } from '../model/text-document';

const DROPPED = new Set(['kept', 'source', 'region']);

/** The document's model values, kept content and file-specific names left out. */
export function modelOf(document: TextDocument): unknown {
  const ids = new Map<string, string>();
  for (const block of document.body)
    if (block.type === 'paragraph' && block.list && !ids.has(block.list.id))
      ids.set(block.list.id, `L${ids.size + 1}`);
  for (const id of Object.keys(document.lists)) if (!ids.has(id)) ids.set(id, `L${ids.size + 1}`);
  const strip = (value: unknown, key = ''): unknown => {
    if (Array.isArray(value)) return value.map((v) => strip(v));
    if (!value || typeof value !== 'object') return value;
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => !DROPPED.has(k) && v !== undefined)
      .map(([k, v]) => [
        key === 'lists' ? (ids.get(k) ?? k) : k,
        k === 'id' && key === 'list' ? (ids.get(v as string) ?? v) : strip(v, k),
      ]);
    return Object.fromEntries(entries);
  };
  return strip(document);
}

/** The whole document as comparable text: kept bytes and maps included. */
export const wholeOf = (document: TextDocument): string =>
  canonical(
    JSON.parse(
      JSON.stringify(document, (_k, v: unknown) =>
        v instanceof Uint8Array ? Buffer.from(v).toString('base64') : v instanceof Map ? [...v] : v,
      ),
    ),
  );
