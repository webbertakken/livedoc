// A spreadsheet's reads of its cards' document (docs/specs/029-sheets/plan-links.md "The `CARD` functions", D509):
// asked at once, then every CARDS_REFRESH_MS while the page is shown. A refusal reads as no access (#REF!); an answer
// naming the version last landed lands nothing, so no card function recalculates; a failed ask is logged and asked
// again on the next tick, what was landed staying.
import { CARDS_DENIED } from '@livedoc/sheets';
import type { CardsHeld } from '@/components/sheets/sheet-engine-hosts';
import { fetchPlanCards, type PlanCardsAnswer } from '@/lib/api/plan-cards';
import { debugLog } from '@/lib/debug-log';

/** How often the cards are asked again: a dashboard's linked sheet's pace (D505). Safe range 5,000 to 60,000 ms. */
export const CARDS_REFRESH_MS = 10_000;

const DENIED: CardsHeld = { unavailable: CARDS_DENIED };

export type CardsWatch = {
  ownerId: string;
  documentId: string;
  land: (held: CardsHeld) => void;
  fetch?: (ownerId: string, documentId: string) => Promise<PlanCardsAnswer>;
};

/** Watches the cards' document until the returned call. */
export function watchSpreadsheetCards({
  ownerId,
  documentId,
  land,
  fetch = fetchPlanCards,
}: CardsWatch): () => void {
  let held: string | null = null;
  let asking = false;
  let stopped = false;
  const ask = async () => {
    if (asking || stopped) return;
    asking = true;
    try {
      const answer = await fetch(ownerId, documentId);
      if (stopped) return;
      const version = answer.kind === 'read' ? answer.version : 'denied';
      if (version === held) return;
      held = version;
      debugLog('[sheets] cards read', { documentId, version });
      land(answer.kind === 'read' ? answer.cards : DENIED);
    } catch (error) {
      console.warn('[sheets] cards read failed', { documentId, error: String(error) });
    } finally {
      asking = false;
    }
  };
  void ask();
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void ask();
  }, CARDS_REFRESH_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
