// A spreadsheet's kept content on the wire (docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Unknown content):
// POST /documents/:id/workbook/kept adds one request's share of it, GET answers it whole. Items and relationships
// travel as they are; an entry's bytes as base64. Sent in requests of up to KEPT_REQUEST_BYTES each (D114).
import {
  isKeptPlace,
  type KeptContent,
  type KeptItem,
  type KeptPart,
  type KeptRelationship,
  type KeptStandard,
  type StoredAt,
} from '@livedoc/sheets/files';
import { base64ToBytes, bytesToBase64 } from './bytes';

/** The most one request carries of kept content, as sent, under the api's 8 MB body (D114). */
export const KEPT_REQUEST_BYTES = 7 * 1024 * 1024;

export type KeptRelationshipLinkDto = {
  id: string;
  type: string;
  target: string;
  external?: boolean;
};
export type KeptPartDto = {
  name: string;
  type: string;
  data: string;
  rels: KeptRelationshipLinkDto[];
};

/** Kept content as it travels: the POST body, and GET's `kept`. */
export type WorkbookKeptDto = {
  standard: KeptStandard;
  items: KeptItem<StoredAt>[];
  relationships: KeptRelationship<StoredAt>[];
  parts: KeptPartDto[];
};

/** GET /documents/:id/workbook/kept: the spreadsheet's kept content whole, or null when it keeps none. */
export type WorkbookKeptResponse = { kept: WorkbookKeptDto | null };

/** POST /documents/:id/workbook/kept: what the spreadsheet keeps now, counted. */
export type WorkbookKeptStoredResponse = {
  standard: KeptStandard;
  items: number;
  relationships: number;
  parts: number;
  bytes: number;
};

export const KEPT_ERRORS = [
  // A body that is not kept content.
  'kept_invalid',
  // An item that is not one whole element or one attribute of its standard's places, or holds a DOCTYPE.
  'kept_item_invalid',
  // An entry whose name is unsafe, LiveDoc's own, dropped by the office packages, or stored already.
  'kept_part_invalid',
  // A relationship whose target leaves the package, or of a type the office packages drop.
  'kept_relationship_invalid',
  // An anchor that is not whole, or on a sheet that is not the workbook's.
  'kept_anchor_invalid',
  // Content of the other standard than the content stored.
  'kept_standard_mismatch',
  // Past the sizes a spreadsheet stores (D113).
  'kept_too_large',
] as const;
export type KeptError = (typeof KEPT_ERRORS)[number];

const link = (rel: KeptRelationshipLinkDto): KeptRelationshipLinkDto => ({
  id: rel.id,
  type: rel.type,
  target: rel.target,
  ...(rel.external ? { external: true } : {}),
});

const partToWire = (part: KeptPart): KeptPartDto => ({
  name: part.name,
  type: part.type,
  data: bytesToBase64(part.data),
  rels: part.rels.map(link),
});

/** Kept content as it travels. */
export function keptToWire(kept: KeptContent<StoredAt>): WorkbookKeptDto {
  return {
    standard: kept.standard,
    items: kept.items,
    relationships: kept.relationships,
    parts: kept.parts.map(partToWire),
  };
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const optionalText = (value: unknown): boolean => value === undefined || isText(value);

function anchorOf(value: unknown): StoredAt | null {
  if (
    !isObject(value) ||
    !optionalText(value.sheet) ||
    !optionalText(value.r) ||
    !optionalText(value.c)
  )
    return null;
  const at: { sheet?: string; r?: string; c?: string } = {};
  if (isText(value.sheet)) at.sheet = value.sheet;
  if (isText(value.r)) at.r = value.r;
  if (isText(value.c)) at.c = value.c;
  return at;
}

function bindingsOf(value: unknown): Record<string, string> | null {
  if (!isObject(value) || !Object.values(value).every(isText)) return null;
  return { ...(value as Record<string, string>) };
}

function itemOf(value: unknown): KeptItem<StoredAt> | null {
  if (!isObject(value) || !isKeptPlace(value.place) || !isText(value.xml)) return null;
  const ns = bindingsOf(value.ns);
  const at = anchorOf(value.at);
  return ns && at ? { place: value.place, xml: value.xml, ns, at } : null;
}

function linkOf(value: unknown): KeptRelationshipLinkDto | null {
  if (!isObject(value) || !isText(value.id) || !isText(value.type) || !isText(value.target))
    return null;
  if (value.external !== undefined && typeof value.external !== 'boolean') return null;
  return link(value as KeptRelationshipLinkDto);
}

const FROM: ReadonlySet<unknown> = new Set(['package', 'workbook', 'sheet']);

function relationshipOf(value: unknown): KeptRelationship<StoredAt> | null {
  const rel = linkOf(value);
  if (!rel || !isObject(value) || !FROM.has(value.from)) return null;
  const at = anchorOf(value.at);
  return at ? { ...rel, from: value.from as KeptRelationship<StoredAt>['from'], at } : null;
}

function partOf(value: unknown): KeptPart | null {
  if (!isObject(value) || !isText(value.name) || !isText(value.type) || !isText(value.data))
    return null;
  if (!Array.isArray(value.rels)) return null;
  const data = value.data === '' ? new Uint8Array() : base64ToBytes(value.data);
  const rels = value.rels.map(linkOf);
  if (!data || rels.some((rel) => rel === null)) return null;
  return { name: value.name, type: value.type, data, rels: rels as KeptRelationshipLinkDto[] };
}

// Every entry of a list read, or null when one is not.
function listOf<T>(value: unknown, read: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.map(read);
  return out.some((entry) => entry === null) ? null : (out as T[]);
}

/** Kept content from its wire shape (only the fields it has), or null when the body is not kept content. */
export function keptFromWire(body: unknown): KeptContent<StoredAt> | null {
  if (!isObject(body) || (body.standard !== 'odf' && body.standard !== 'ooxml')) return null;
  const items = listOf(body.items, itemOf);
  const relationships = listOf(body.relationships, relationshipOf);
  const parts = listOf(body.parts, partOf);
  if (!items || !relationships || !parts) return null;
  return { standard: body.standard, items, relationships, parts };
}

const utf8 = new TextEncoder();
// What an entry weighs as sent: its JSON, the bytes as base64.
const sentBytes = (value: unknown): number => utf8.encode(JSON.stringify(value)).byteLength;

/**
 * Kept content in the requests that send it, in its order, each of up to KEPT_REQUEST_BYTES as sent (one entry
 * larger than that goes alone); none for nothing kept.
 */
export function keptBatches(kept: KeptContent<StoredAt>): WorkbookKeptDto[] {
  const batches: WorkbookKeptDto[] = [];
  let batch: WorkbookKeptDto | null = null;
  let size = 0;
  const add = <K extends 'items' | 'relationships' | 'parts'>(
    key: K,
    entry: WorkbookKeptDto[K][number],
  ) => {
    const bytes = sentBytes(entry);
    if (!batch || size + bytes > KEPT_REQUEST_BYTES) {
      batch = { standard: kept.standard, items: [], relationships: [], parts: [] };
      batches.push(batch);
      size = 0;
    }
    (batch[key] as WorkbookKeptDto[K][number][]).push(entry);
    size += bytes;
  };
  for (const item of kept.items) add('items', item);
  for (const rel of kept.relationships) add('relationships', rel);
  for (const part of kept.parts) add('parts', partToWire(part));
  return batches;
}
