// The cards a spreadsheet's card functions read (docs/specs/029-sheets/plan-links.md "The `CARD` functions"): the Plan
// document's items, and its card types and boards' column names from its plan, asked with the reader's own access,
// never the spreadsheet's share link. A document that is not there and one the reader may not open answer alike
// (`denied`). The version names the items', the card types' and the column names' state, so an unchanged answer is
// known (D509).
import type { ItemsResponse, PlanResponse } from '@livedoc/api-schema';
import type { CardData } from '@/components/sheets/sheet-engine-hosts';
import { API_BASE, apiFetch, apiHeaders, expectOk } from './core';

export type PlanCardsAnswer =
  { kind: 'read'; cards: CardData; version: string } | { kind: 'denied' };

const REFUSED = new Set([403, 404, 410]);

export async function fetchPlanCards(
  ownerId: string,
  documentId: string,
): Promise<PlanCardsAnswer> {
  const base = `${API_BASE}/documents/${encodeURIComponent(documentId)}`;
  const headers = await apiHeaders(ownerId);
  const [planRes, itemsRes] = await Promise.all([
    apiFetch(`${base}/plan`, { headers }),
    apiFetch(`${base}/items`, { headers }),
  ]);
  if (REFUSED.has(planRes.status) || REFUSED.has(itemsRes.status)) return { kind: 'denied' };
  const [plan, items] = await Promise.all([
    expectOk<PlanResponse>(planRes, 'plan cards'),
    expectOk<ItemsResponse>(itemsRes, 'plan cards items'),
  ]);
  const names = plan.statuses.map((s) => `${s.status}=${s.name}`).join('|');
  return {
    kind: 'read',
    cards: {
      items: items.items,
      types: [...plan.types],
      statusNames: new Map(plan.statuses.map((s) => [s.status, s.name])),
    },
    version: `${items.rev}:${plan.itemTypesRev}:${names}`,
  };
}
