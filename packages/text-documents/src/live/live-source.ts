// What a file brought around the model, in the live state's `source` map
// (docs/specs/034-text-documents/live-editing-and-storage.md "The layout"): its values as JSON under `json`, with each
// byte array standing in as `{ $bytes: n }` and kept under `bytes:n` as bytes, and each Map as `{ $map: entries }`.
// Written once when a file is opened; replaced only by a conversion.
import * as Y from 'yjs';
import type { OdfSource, OoxmlSource } from '../model/text-document';

export type Source = OdfSource | OoxmlSource;

const JSON_KEY = 'json';
const bytesKey = (n: number) => `bytes:${n}`;

export function writeSource(map: Y.Map<unknown>, source: Source | undefined): void {
  map.clear();
  if (!source) return;
  const bytes: Uint8Array[] = [];
  const json = JSON.stringify(source, (_key, value: unknown) => {
    if (value instanceof Uint8Array) return { $bytes: bytes.push(value) - 1 };
    if (value instanceof Map) return { $map: [...value] };
    return value;
  });
  map.set(JSON_KEY, json);
  bytes.forEach((b, n) => map.set(bytesKey(n), b));
}

export function readSource(map: Y.Map<unknown>): Source | undefined {
  const json = map.get(JSON_KEY);
  if (typeof json !== 'string') return undefined;
  return JSON.parse(json, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const v = value as { $bytes?: unknown; $map?: unknown };
      if (typeof v.$bytes === 'number') {
        const b = map.get(bytesKey(v.$bytes));
        return b instanceof Uint8Array ? b : new Uint8Array();
      }
      if (Array.isArray(v.$map)) return new Map(v.$map as [unknown, unknown][]);
    }
    return value;
  }) as Source;
}
