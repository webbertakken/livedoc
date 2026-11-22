// What a closing page left of a record's live tabs (docs/specs/035-pdf-documents/live-editing-and-storage.md "A
// page's last moment") joins the record before a conversion reads it: Sync Document and Duplicate carry a change
// made in a page's last moment as the tab's next open would. A kind's own join is loaded only when a copy was left,
// so a conversion of any other document loads nothing of it.
import {
  hasPartingCopies,
  partingStorage,
  type PartingStorage,
} from '../live-tab/live-tab-parting-keys';
import { offlineGetRecord, type OfflineDocumentRecord } from './offline-store';

/** The record as it reads once every parting copy left of its live tabs has joined it. */
export async function offlineRecordWithPartings(
  rec: OfflineDocumentRecord,
  storage: PartingStorage | null = partingStorage(),
): Promise<OfflineDocumentRecord> {
  if (!hasPartingCopies(storage, rec.id)) return rec;
  const { offlineJoinPdfPartingCopies } = await import('./offline-pdf-documents');
  const joined = await offlineJoinPdfPartingCopies(rec, storage);
  return joined > 0 ? ((await offlineGetRecord(rec.id)) ?? rec) : rec;
}
