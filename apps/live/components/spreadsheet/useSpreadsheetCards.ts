'use client';

// The cards a spreadsheet's card functions read (docs/specs/029-sheets/plan-links.md "The `CARD` functions"): while
// any formula reads them, from the Plan document its settings name (Cards From), watched with the reader's own access
// (spreadsheet-cards.ts); with none named, why not, so the functions read #REF!. Loading until the first answer.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { CARDS_UNSET, type WorkbookRecord } from '@livedoc/sheets';
import type { CardsHeld } from '@/components/sheets/sheet-engine-hosts';
import { sheetStoreOf } from '@/components/sheets/sheet-store-client';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { watchSpreadsheetCards } from './spreadsheet-cards';

const UNSET: CardsHeld = { unavailable: CARDS_UNSET };
const NO_SUBSCRIBE = () => () => {};

export function useSpreadsheetCards(bridge: SheetsBridge | null, workbook: WorkbookRecord): void {
  const store = bridge ? sheetStoreOf(bridge) : null;
  const snapshot = () => store?.getVersion() ?? 0;
  const version = useSyncExternalStore(store ? store.subscribe : NO_SUBSCRIBE, snapshot, snapshot);
  // oxlint-disable-next-line react/exhaustive-deps -- the store's version says when its formulas changed
  const reads = useMemo(() => store?.usesCards() ?? false, [store, version]);
  const ownerId = bridge?.scope.ownerId ?? null;
  const cardsDocument = workbook.settings.cardsDocument ?? null;
  useEffect(() => {
    if (!store || !reads || !ownerId) return;
    if (!cardsDocument) {
      store.setCards(UNSET);
      return;
    }
    store.setCards(null);
    return watchSpreadsheetCards({
      ownerId,
      documentId: cardsDocument,
      land: (held) => store.setCards(held),
    });
  }, [store, reads, ownerId, cardsDocument]);
}
