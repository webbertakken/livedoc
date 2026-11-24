// Single-source duplicate-document helper.
//
// "Clone an existing document into a fresh one under the same owner"
// is a multi-step operation that lived as three near-identical
// inlines (editor-page, /new, /explorer). Per AGENTS.md it's
// supposed to live in one place — extracting it here removes the
// drift risk (one copy could silently forget to remap link
// references and break cross-tab navigation in the copy).
//
// Steps:
//
//   1. Load the source document's meta + every tab.
//   2. Mint a fresh tab id for each source tab.
//   3. Walk every element; any element.link.tabId that points at a
//      source tab gets rewritten to the matching new id so the copy
//      keeps its internal navigation.
//   4. Create the new document with a fresh id under `ownerId`, with
//      the remapped tabs seeded inline.
//
// Returns the new document id on success, undefined on failure
// (network glitch, source not found, etc.). Callers handle
// post-duplication side effects (list refresh, navigate, etc.) —
// the helper deliberately doesn't touch state outside the api
// round-trip so it can stand alone.

import type { CreationIntent, DocumentPlacement, RecordedIntent } from '@livedoc/api-schema';
import { tabKindOf, withTabLinksRemapped, type Tab } from '@livedoc/document';
import {
  apiCreateDocument,
  apiDeleteDocument,
  apiLoadDocument,
  apiLoadTab,
  apiSaveDocumentMeta,
} from './api-client';
import { ApiError } from './api/core';
import {
  isOfflineId,
  offlineCreateDocument,
  offlineGetRecord,
  offlinePutRecord,
} from './offline/offline-store';
import { offlineRecordWithPartings } from './offline/offline-partings';
import { fetchItems } from './api/items';
import { storeAsCreates } from '@livedoc/items';
import { fetchAllSheets, sheetAsCreate } from './api/sheets';
import { apiLoadPdfState } from './api/pdf-documents';
import { apiLoadTextDocumentState } from './api/text-documents';
import { fetchKept, sendKept } from './api/workbook-kept';
import { base64OfBytes } from '@livedoc/text-documents/base64';

// The refusals that mean "not beside the source for this person", where the copy is filed at the
// explicit root of My Documents instead (docs/specs/013-workspace/default-folders.md "Duplicate").
const PLACE_REFUSALS: ReadonlySet<string> = new Set([
  'team_forbidden',
  'folder_not_found',
  'folder_scope_mismatch',
]);
const EXPLICIT_ROOT: DocumentPlacement = { teamId: null, folderId: null };

// The source's recorded creation intent, carried unchanged; none when it is unknown.
// The copy's kept content sent after its create; a refusal moves the half-made copy to the Bin and fails the copy.
async function keptSent(
  ownerId: string,
  documentId: string,
  kept: NonNullable<Awaited<ReturnType<typeof fetchKept>>>,
): Promise<boolean> {
  try {
    await sendKept({ ownerId, documentId, shareCode: null }, kept);
    return true;
  } catch (error) {
    console.warn('[duplicate] kept content refused', { documentId, error: String(error) });
    await apiDeleteDocument(ownerId, documentId).catch(() => {});
    return false;
  }
}

function recordedIntentOf(src: RecordedIntent): CreationIntent | undefined {
  if (!src.opensIn || !src.tabKind) return undefined;
  return {
    mode: src.opensIn,
    tabKind: src.tabKind,
    ...(src.templateFamily ? { templateFamily: src.templateFamily } : {}),
  };
}

// `placement` files the copy in the create itself (docs/specs/013-workspace/folders.md "Placement
// on create"). Absent, the copy goes beside its source: the source's own team and folder. Either way
// it is an explicit placement (`folderId` always sent, null being the root chosen on purpose), so a
// Duplicate is never routed by a default folder; it records the source's recorded intent unchanged
// (docs/specs/013-workspace/default-folders.md "Duplicate").
export async function duplicateDocument(
  ownerId: string,
  sourceId: string,
  placement?: DocumentPlacement,
): Promise<string | undefined> {
  const src = await apiLoadDocument(ownerId, sourceId).catch(() => null);
  if (!src) return undefined;
  const fullTabs = await Promise.all(
    src.tabs.map((t) => apiLoadTab(ownerId, src.id, t.id, null).catch(() => null)),
  );
  // Build the old → new tab-id map from the source's declared tab
  // list, not from the loaded payloads — a missing tab fetch
  // shouldn't break the link remap for tabs that DID load.
  const tabIdMap = new Map<string, string>();
  for (const t of src.tabs) tabIdMap.set(t.id, crypto.randomUUID());
  const remappedTabs: Tab[] = [];
  for (const tab of fullTabs) {
    if (!tab) continue;
    const newTabId = tabIdMap.get(tab.id) ?? crypto.randomUUID();
    // Tab / element links and a drawing tab's text document tab follow the copy's tabs; document and url links
    // leave the document and survive unchanged (shared with the api's copy
    // route via @livedoc/document).
    remappedTabs.push({ ...withTabLinksRemapped(tab, tabIdMap), id: newTabId });
  }
  const newId = crypto.randomUUID();
  // The item store comes with the copy, ids and keys unchanged, so every Plan card and board on
  // the copied tabs finds its items (docs/specs/026-plan/items.md "Copies and exports").
  // Best-effort like the tabs: a copy without its items beats no copy.
  const itemStore = await fetchItems({
    ownerId,
    documentId: sourceId,
    shareCode: null,
    tabId: null,
  }).catch(() => null);
  // The sheet store too (docs/specs/029-sheets/sheet-store.md "Copies"): sheet ids kept, each on its tab's new id.
  const sheets = (
    await fetchAllSheets({ ownerId, documentId: sourceId, shareCode: null, tabId: null }).catch(
      () => [],
    )
  )
    .filter((s) => tabIdMap.has(s.tabId))
    .map((s) => ({ ...s, tabId: tabIdMap.get(s.tabId)! }));
  // Offline Mode (docs/specs/006-document/offline-mode.md): a copy of an offline document is another OFFLINE
  // document. Creating it on the server instead would silently upload content
  // the user explicitly chose to keep in this browser. Tabs are stored whole
  // (per-tab `folder` included), so no follow-up meta write is needed.
  if (await isOfflineId(sourceId)) {
    try {
      await offlineCreateDocument(
        {
          id: newId,
          name: `${src.name} copy`,
          tabs: remappedTabs,
          // A copy of a spreadsheet is a spreadsheet (docs/specs/029-sheets/sheet-store.md "Copies and exports").
          ...(src.workbook ? { workbook: src.workbook } : {}),
        },
        Date.now(),
      );
      // Each text document's state under its tab's new id (docs/specs/034-text-documents/
      // live-editing-and-storage.md "A text document in This Browser").
      // With what a closing page left of a live tab ("A page's last moment"), so the copy holds it too.
      const read = await offlineGetRecord(sourceId);
      const source = read && (await offlineRecordWithPartings(read));
      const textDocuments = (source?.textDocuments ?? [])
        .filter((t) => tabIdMap.has(t.tabId))
        .map((t) => ({ ...t, tabId: tabIdMap.get(t.tabId)! }));
      // Each PDF tab's live changes too (docs/specs/035-pdf-documents/live-editing-and-storage.md "Duplicate"): the
      // copy's tab names the same key, so no byte is copied.
      const pdfDocuments = (source?.pdfDocuments ?? [])
        .filter((t) => tabIdMap.has(t.tabId))
        .map((t) => ({ ...t, tabId: tabIdMap.get(t.tabId)! }));
      // A spreadsheet's kept content (sheet-store.md "Copies and exports"), anchored to the sheet ids the copy keeps.
      const kept = source?.kept;
      if (
        itemStore?.items.length ||
        src.itemTypes ||
        sheets.length ||
        textDocuments.length ||
        pdfDocuments.length ||
        kept
      ) {
        const rec = await offlineGetRecord(newId);
        if (rec) {
          await offlinePutRecord({
            ...rec,
            ...(itemStore?.items.length
              ? {
                  items: itemStore.items,
                  itemsRev: itemStore.rev,
                  itemsNextKey: itemStore.nextKey,
                }
              : {}),
            // The type catalogue comes with it (docs/specs/026-plan/item-types.md).
            ...(src.itemTypes ? { itemTypes: src.itemTypes } : {}),
            ...(sheets.length ? { sheets } : {}),
            ...(textDocuments.length ? { textDocuments } : {}),
            ...(pdfDocuments.length ? { pdfDocuments } : {}),
            ...(kept ? { kept } : {}),
          });
        }
      }
      return newId;
    } catch {
      return undefined;
    }
  }
  // A failed create must return undefined per the contract above —
  // returning the id anyway made callers toast "Document duplicated"
  // and navigate to a document that doesn't exist.
  const intent = recordedIntentOf(src);
  // Each text document's writing comes with it (docs/specs/034-text-documents/live-editing-and-storage.md "Copies"):
  // its whole state, under its tab's new id. A state that cannot be read fails the copy rather than leave it blank.
  let textDocuments: { tabId: string; state: string }[];
  try {
    textDocuments = await Promise.all(
      fullTabs
        .filter((t): t is Tab => t !== null && tabKindOf(t) === 'text-document')
        .map(async (t) => ({
          tabId: tabIdMap.get(t.id)!,
          state: base64OfBytes(
            await apiLoadTextDocumentState({
              ownerId,
              documentId: src.id,
              tabId: t.id,
              shareCode: null,
            }),
          ),
        })),
    );
  } catch (error) {
    console.warn('[duplicate] text document state unreadable', { sourceId, error: String(error) });
    return undefined;
  }
  // A spreadsheet's kept content comes with it (sheet-store.md "Copies and exports"); one that cannot be read fails
  // the copy rather than leave it behind.
  let kept: Awaited<ReturnType<typeof fetchKept>>;
  try {
    kept = src.workbook
      ? await fetchKept({ ownerId, documentId: src.id, shareCode: null })
      : undefined;
  } catch (error) {
    console.warn('[duplicate] kept content unreadable', { sourceId, error: String(error) });
    return undefined;
  }
  // Each PDF tab's live changes too (docs/specs/035-pdf-documents/live-editing-and-storage.md "Copies, the Trash and
  // versions"): the copy's tab names the same stored file, and what was changed on it comes along or the copy fails.
  let pdfDocuments: { tabId: string; state: string }[];
  try {
    pdfDocuments = await Promise.all(
      fullTabs
        .filter((t): t is Tab => t !== null && tabKindOf(t) === 'pdf')
        .map(async (t) => {
          const scope = { ownerId, documentId: src.id, tabId: t.id, shareCode: null };
          return {
            tabId: tabIdMap.get(t.id)!,
            state: base64OfBytes((await apiLoadPdfState(scope)).update),
          };
        }),
    );
  } catch (error) {
    console.warn('[duplicate] pdf live changes unreadable', { sourceId, error: String(error) });
    return undefined;
  }
  const create = (place: DocumentPlacement) =>
    apiCreateDocument(ownerId, {
      id: newId,
      name: `${src.name} copy`,
      tabs: remappedTabs,
      teamId: place.teamId,
      folderId: place.folderId,
      ...(intent ? { intent } : {}),
      ...(itemStore?.items.length ? { items: storeAsCreates(itemStore.items) } : {}),
      ...(src.itemTypes ? { itemTypes: src.itemTypes } : {}),
      ...(sheets.length ? { sheets: sheets.map(sheetAsCreate) } : {}),
      ...(src.workbook ? { workbook: src.workbook } : {}),
      ...(textDocuments.length ? { textDocuments } : {}),
      ...(pdfDocuments.length ? { pdfDocuments } : {}),
    });
  try {
    await create(placement ?? { teamId: src.teamId, folderId: src.folderId });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : null;
    if (code === null || !PLACE_REFUSALS.has(code)) return undefined;
    console.warn(`[duplicate] placement refused reason=${code}, filed at the root`);
    try {
      await create(EXPLICIT_ROOT);
    } catch {
      return undefined;
    }
  }
  if (kept && !(await keptSent(ownerId, newId, kept))) return undefined;
  // Tab-folder structure (docs/specs/006-document/tab-folders.md) doesn't ride the create — the seed
  // path strips per-tab `folder` — so it's re-applied via the same meta
  // PUT the autosave uses. Best-effort: a copy with loose tabs beats no
  // copy.
  if (remappedTabs.some((t) => t.folder)) {
    await apiSaveDocumentMeta(ownerId, {
      id: newId,
      tabs: remappedTabs.map((t) => ({ id: t.id, ...(t.folder ? { folder: t.folder } : {}) })),
    }).catch(() => {});
  }
  return newId;
}
