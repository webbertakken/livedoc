// A PDF tab's previous versions (docs/specs/035-pdf-documents/saving.md "Previous versions and version history";
// live-editing-and-storage.md "Replacing the stored file"): every stored file a tab held before the one it names,
// kept by the room beside the tab, with when it was replaced and why. The tab holds each one's bytes until its day
// (docs/specs/006-document/blob-store.md "Holds and retention").
import type { PdfStoredReason } from '@livedoc/api-schema';
import { FILE_PREVIOUS_VERSION_DAYS, type BlobKey } from '@livedoc/document';
import type { DocumentEnv } from '../types';

const DAY_MS = 86_400_000;

/** The room's schema step: a tab's previous versions go with the tab. */
export const PDF_PREVIOUS_STEP = `
CREATE TABLE IF NOT EXISTS pdf_previous (
  tab_id      TEXT    NOT NULL REFERENCES tabs (id) ON DELETE CASCADE,
  blob        TEXT    NOT NULL,
  size        INTEGER NOT NULL,
  replaced_at INTEGER NOT NULL,
  reason      TEXT    NOT NULL,
  PRIMARY KEY (tab_id, replaced_at, blob)
);
`;

export type PreviousStoredFile = {
  readonly blob: BlobKey;
  readonly size: number;
  readonly replacedAt: number;
};

/** The day a previous version's bytes stop being held. */
export const previousVersionHeldUntil = (replacedAt: number): number =>
  replacedAt + FILE_PREVIOUS_VERSION_DAYS * DAY_MS;

/** The statement that keeps a stored file as a previous version, for the batch that replaces it. */
export function previousStoredFileStatement(
  env: DocumentEnv,
  tabId: string,
  file: { blob: BlobKey; size: number },
  replaced: { at: number; reason: PdfStoredReason },
): D1PreparedStatement {
  return env.DOCUMENT_DB.prepare(
    `INSERT OR REPLACE INTO pdf_previous (tab_id, blob, size, replaced_at, reason) VALUES (?, ?, ?, ?, ?)`,
  ).bind(tabId, file.blob, file.size, replaced.at, replaced.reason);
}

/** A tab's previous versions, the newest first. */
export async function previousStoredFiles(
  env: DocumentEnv,
  tabId: string,
): Promise<PreviousStoredFile[]> {
  const rows = await env.DOCUMENT_DB.prepare(
    'SELECT blob, size, replaced_at FROM pdf_previous WHERE tab_id = ? ORDER BY replaced_at DESC',
  )
    .bind(tabId)
    .all<{ blob: BlobKey; size: number; replaced_at: number }>();
  return rows.results.map((row) => ({
    blob: row.blob,
    size: row.size,
    replacedAt: row.replaced_at,
  }));
}
