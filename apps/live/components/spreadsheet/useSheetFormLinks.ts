'use client';

// The forms a spreadsheet takes responses from, on its sheet bar (docs/specs/029-sheets/plan-links.md "Form
// responses", D506): a sheet a form writes to wears a form mark on its tab, and its menu's Unlink Form (Editors) takes
// every connection to that sheet back, as Google's does, after asking. The record the api answers is applied at once;
// the room sends it to everyone else.
import { useMemo, useSyncExternalStore } from 'react';
import { WorkbookForms, type WorkbookRecord } from '@livedoc/sheets';
import { sheetStoreOf } from '@/components/sheets/sheet-store-client';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { useConfirm } from '@/hooks/ui/useConfirm';
import { useLatest } from '@/hooks/ui/useLatest';
import { unlinkFormFromSheet } from '@/lib/api/workbook-link';
import { debugLog } from '@/lib/debug-log';

export const UNLINK_FAILED = 'The form couldn’t be unlinked. Try again.';

export type SheetFormLinks = {
  // The tabs whose sheets take responses from a form.
  takes: ReadonlySet<string>;
  // Unlink Form on a tab, for an Editor; null for anyone else.
  unlink: ((tabId: string) => void) | null;
};

const NO_SUBSCRIBE = () => () => {};

export function useSheetFormLinks(
  bridge: SheetsBridge | null,
  tabs: readonly { id: string }[],
  workbook: WorkbookRecord,
  onWorkbook?: (workbook: WorkbookRecord) => void,
): SheetFormLinks {
  const confirm = useConfirm();
  const store = bridge ? sheetStoreOf(bridge) : null;
  const snapshot = () => store?.getVersion() ?? 0;
  const version = useSyncExternalStore(store ? store.subscribe : NO_SUBSCRIBE, snapshot, snapshot);
  const latest = useLatest({ bridge, store, confirm, onWorkbook });
  const forms = workbook.forms;
  const takes = useMemo(() => {
    void version;
    const on = new Set<string>();
    if (!store || !forms?.length) return on;
    for (const tab of tabs) {
      const sheet = store.sheetsOn(tab.id)[0];
      if (sheet && WorkbookForms.takesResponses(forms, sheet.id)) on.add(tab.id);
    }
    return on;
  }, [store, tabs, forms, version]);
  const canUnlink = !!bridge?.canEdit;
  return useMemo(
    () => ({
      takes,
      unlink: canUnlink
        ? (tabId: string) => {
            const { bridge: b, store: s, confirm: ask, onWorkbook: apply } = latest.current;
            const sheet = s?.sheetsOn(tabId)[0];
            if (!b || !sheet) return;
            void ask({
              title: 'Unlink Form?',
              message: `Responses will no longer be sent to “${sheet.title}”. Its form stops taking responses until someone chooses where they go.`,
              confirmLabel: 'Unlink',
              cancelLabel: 'Cancel',
            }).then(async (yes) => {
              if (!yes) return;
              try {
                const saved = await unlinkFormFromSheet(
                  b.scope.ownerId,
                  b.scope.documentId,
                  { sheetId: sheet.id },
                  b.scope.shareCode,
                );
                apply?.(saved.workbook);
                debugLog('[workbook] form unlinked', {});
              } catch (error) {
                console.warn('[workbook] form unlink failed', { reason: String(error) });
                b.toast(UNLINK_FAILED);
              }
            });
          }
        : null,
    }),
    [takes, canUnlink, latest],
  );
}
