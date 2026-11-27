// Where the sheet bar's changes land (docs/specs/029-sheets/sheet-store.md "Changing the workbook", "Offline
// documents"): a spreadsheet on LiveDoc through the workbook routes, whose tab list and sheets come back through the
// room; one in This Browser in the editor itself, its tabs changed quietly (the sheet bar's own undo step holds the
// change) and its sheets through the sheet store, which keeps them in its record.
import type { Tab } from '@livedoc/document';
import type { SheetFromFile } from '@livedoc/sheets/files';
import {
  layoutForCopy,
  sheetToJson,
  withFreeTableNames,
  workbookSheetLayout,
} from '@livedoc/sheets';
import {
  apiAddWorkbookSheet,
  apiDeleteWorkbookSheet,
  apiMoveWorkbookSheet,
} from '@/lib/api/workbook-sheets';
import { debugLog } from '@/lib/debug-log';
import { sendFileParts } from '@/lib/spreadsheet/send-file-parts';
import type { WorkbookScope } from '@/lib/api/workbook';
import { newSheetTab } from '@/lib/spreadsheet/spreadsheet-document';
import { tabsWithInserted } from '@/lib/spreadsheet/sheet-bar-places';
import type { SheetStore } from '@/components/sheets/sheet-store-client';

/**
 * A sheet tab put in or taken out: `after` is the tab it follows (null: first), `restore` a kept sheet put back, `seed`
 * a new sheet born with its layout and cells (a pivot table value's details, pivot-tables.md "Details").
 */
export type SheetBarEntry = {
  tabId: string;
  sheetId: string;
  name: string;
  after: string | null;
  copyOf?: string;
  restore?: true;
  seed?: SheetFromFile;
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
    put: async ({ tabId, sheetId, name, after, copyOf, restore, seed }) => {
      if (copyOf) await settle();
      if (seed && !restore) return putSeeded(scope, { tabId, sheetId, name, after, seed });
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

// A sheet born with its cells: the first request carries what it can, the rest follows as writes; a part refused
// takes the half-made sheet back out.
async function putSeeded(
  scope: WorkbookScope,
  entry: Required<Pick<SheetBarEntry, 'tabId' | 'sheetId' | 'name' | 'seed'>> &
    Pick<SheetBarEntry, 'after'>,
): Promise<void> {
  const files = await import('@livedoc/sheets/files');
  const parts = files.fileParts([{ ...entry.seed, id: entry.sheetId, title: entry.name }]);
  const first = parts.seeds[0]!;
  await apiAddWorkbookSheet(scope, {
    tabId: entry.tabId,
    sheetId: entry.sheetId,
    after: entry.after ?? '',
    name: entry.name,
    seed: { layout: first.layout, cells: first.cells },
  });
  try {
    await sendFileParts({ ...scope, tabId: null }, parts, () => {});
  } catch (error) {
    await apiDeleteWorkbookSheet(scope, entry.sheetId).catch((e: unknown) => {
      debugLog('[workbook] half-made sheet not taken out', { error: String(e) });
    });
    throw error;
  }
}

type OfflineStore = Pick<
  SheetStore,
  'create' | 'release' | 'restoreReleased' | 'sheet' | 'layoutsOn'
>;

export function offlineSheetBar(
  store: OfflineStore,
  editTabs: (map: (tabs: Tab[]) => Tab[]) => void,
): SheetBarBackend {
  const without = (tabId: string) => editTabs((ts) => ts.filter((t) => t.id !== tabId));
  return {
    put: ({ tabId, sheetId, name, after, copyOf, restore, seed }) =>
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
            ...(copyOf
              ? { copyOf }
              : seed
                ? { layout: seed.layout, cells: seed.cells }
                : { layout: workbookSheetLayout() }),
          },
          // The workbook's named ranges stay with the original (sheet.md D298); its tables take free names (D451).
          source
            ? {
                ...sheetToJson(source),
                layout: withFreeTableNames(
                  layoutForCopy(source.layout, true),
                  store.layoutsOn(source.tabId),
                ),
                id: sheetId,
                tabId,
                title: name,
                rev: 0,
              }
            : undefined,
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
