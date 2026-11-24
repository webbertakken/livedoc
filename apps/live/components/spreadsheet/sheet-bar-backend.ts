// Where the sheet bar's changes land (docs/specs/029-sheets/sheet-store.md "Changing the workbook", "Offline
// documents"): a spreadsheet on LiveDoc through the workbook routes, whose tab list and sheets come back through the
// room; one in This Browser in the editor itself, its tabs changed quietly (the sheet bar's own undo step holds the
// change) and its sheets through the sheet store, which keeps them in its record.
import type { Tab } from '@livedoc/document';
import { sheetToJson, workbookSheetLayout } from '@livedoc/sheets';
import {
  apiAddWorkbookSheet,
  apiDeleteWorkbookSheet,
  apiMoveWorkbookSheet,
} from '@/lib/api/workbook-sheets';
import type { WorkbookScope } from '@/lib/api/workbook';
import { newSheetTab } from '@/lib/spreadsheet/spreadsheet-document';
import { tabsWithInserted } from '@/lib/spreadsheet/sheet-bar-places';
import type { SheetStore } from '@/components/sheets/sheet-store-client';

/** A sheet tab put in or taken out: `after` is the tab it follows (null: first), `restore` a kept sheet put back. */
export type SheetBarEntry = {
  tabId: string;
  sheetId: string;
  name: string;
  after: string | null;
  copyOf?: string;
  restore?: true;
};

/** Each resolves once the change is made, and rejects with the refusal (an ApiError's code) when it is not. */
export type SheetBarBackend = {
  put: (entry: SheetBarEntry) => Promise<void>;
  take: (entry: Pick<SheetBarEntry, 'tabId' | 'sheetId'>) => Promise<void>;
  move: (entry: Pick<SheetBarEntry, 'tabId' | 'sheetId' | 'after'>) => Promise<void>;
};

export class SheetBarRefusal extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

// `settle` lets this page's own writes reach the server first, so a copy holds what was just typed.
export function cloudSheetBar(scope: WorkbookScope, settle: () => Promise<void>): SheetBarBackend {
  return {
    put: async ({ tabId, sheetId, name, after, copyOf, restore }) => {
      if (copyOf) await settle();
      await apiAddWorkbookSheet(scope, {
        tabId,
        sheetId,
        after: after ?? '',
        // A kept sheet comes back under its own name.
        ...(restore ? {} : { name }),
        ...(copyOf ? { copyOf } : {}),
      });
    },
    take: ({ sheetId }) => apiDeleteWorkbookSheet(scope, sheetId),
    move: ({ sheetId, after }) => apiMoveWorkbookSheet(scope, sheetId, after ?? ''),
  };
}

type OfflineStore = Pick<SheetStore, 'create' | 'release' | 'restoreReleased' | 'sheet'>;

export function offlineSheetBar(
  store: OfflineStore,
  editTabs: (map: (tabs: Tab[]) => Tab[]) => void,
): SheetBarBackend {
  const without = (tabId: string) => editTabs((ts) => ts.filter((t) => t.id !== tabId));
  return {
    put: ({ tabId, sheetId, name, after, copyOf, restore }) =>
      new Promise<void>((resolve, reject) => {
        // A refusal takes the tab back out and is said by the sheet bar, once.
        const landing = {
          onRefused: (code: string | null) => {
            without(tabId);
            reject(new SheetBarRefusal(code ?? 'write_invalid'));
            return true;
          },
          onCreated: resolve,
        };
        editTabs((ts) => tabsWithInserted(ts, newSheetTab(tabId, name), after));
        if (restore) {
          if (!store.restoreReleased(sheetId, landing)) landing.onRefused('sheet_not_found');
          return;
        }
        const source = copyOf ? store.sheet(copyOf) : undefined;
        if (copyOf && !source) {
          landing.onRefused('sheet_not_found');
          return;
        }
        store.create(
          {
            id: sheetId,
            tabId,
            title: name,
            ...(copyOf ? { copyOf } : { layout: workbookSheetLayout() }),
          },
          source ? { ...sheetToJson(source), id: sheetId, tabId, title: name, rev: 0 } : undefined,
          landing,
        );
      }),
    take: async ({ tabId, sheetId }) => {
      without(tabId);
      store.release([sheetId]);
    },
    move: async ({ tabId, after }) => {
      editTabs((ts) => {
        const tab = ts.find((t) => t.id === tabId);
        return tab ? tabsWithInserted(ts, tab, after) : ts;
      });
    },
  };
}
