// A create's content, stored by the document's room before the worker writes the document's D1 row
// (docs/specs/006-document/document-storage.md, D11): the document row with its dates, slide
// deck and type catalogue, the seeded tabs, and on a genuine create the seed items and sheets. Everything is
// validated by the worker first; what the stores themselves refuse (a full item store, a sheet over its caps, a tab
// over the row cap) comes back as the refusal the request answers.

import type { SheetCreateRequest } from '@livedoc/api-schema';
import type { Tab } from '@livedoc/document';
import type { ItemCreate } from '@livedoc/items';
import type { ContentSummary } from '../db/content-summary';
import { seedTabs } from '../db/tabs';
import { TabTooLargeError } from '../limits';
import { seedItems } from '../routes/item-routes';
import { seedSheets } from '../routes/sheet-routes';
import type { DocumentEnv } from '../types';
import { contentSummaryOf } from './content-summary';
import { documentRouteContext, type RouteIdentity } from './document-route';

export type DocumentSeed = {
  // Who is creating it, as the worker resolved them.
  identity: RouteIdentity;
  owner: string;
  // The caller's own id again (an offline sync's retry): the document row keeps its deck and catalogue, and no item
  // or sheet is seeded twice.
  recommit: boolean;
  savedAt: number;
  createdAt: number;
  presentation: string | null;
  // The validated type catalogue, as stored (JSON), or null for the default types.
  itemTypes: string | null;
  tabs: Tab[] | null;
  items: ItemCreate[];
  sheets: SheetCreateRequest[];
};

export type CreateOutcome =
  { ok: true; summary: ContentSummary } | { ok: false; status: number; body: unknown };

export async function createDocumentContent(
  env: DocumentEnv,
  documentId: string,
  seed: DocumentSeed,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
): Promise<CreateOutcome> {
  // A re-commit keeps the deck and catalogue it has; only its last save moves.
  await env.DOCUMENT_DB.prepare(
    `INSERT INTO document (id, presentation, item_types, saved_at, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET saved_at = excluded.saved_at`,
  )
    .bind(documentId, seed.presentation, seed.itemTypes, seed.savedAt, seed.createdAt)
    .run();
  if (seed.tabs) {
    try {
      await seedTabs(env, documentId, seed.tabs, seed.savedAt);
    } catch (error) {
      if (error instanceof TabTooLargeError)
        return { ok: false, status: 413, body: { error: 'payload_too_large' } };
      throw error;
    }
  }
  if (!seed.recommit && (seed.items.length > 0 || seed.sheets.length > 0)) {
    // The seed writers are the item and sheet routes' own; they take a route context.
    const request = new Request(`https://room.invalid/api/documents/${documentId}`, {
      method: 'POST',
    });
    const ctx = documentRouteContext(env, request, seed.identity, waitUntil);
    const refused =
      (seed.items.length > 0 ? await seedItems(ctx, documentId, seed.owner, seed.items) : null) ??
      (seed.sheets.length > 0 ? await seedSheets(ctx, documentId, seed.owner, seed.sheets) : null);
    if (refused) {
      const body: unknown = await refused.json().catch(() => null);
      console.warn('[documents] create seed refused', { documentId, status: refused.status });
      return { ok: false, status: refused.status, body };
    }
  }
  return { ok: true, summary: await contentSummaryOf(env, documentId) };
}
