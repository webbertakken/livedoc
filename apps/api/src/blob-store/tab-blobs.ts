// A tab may name only bytes the blob store holds (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage":
// "sent before the tab names them"), so no reader ever opens a tab whose file is not there.
import { pdfTabOf } from '@livedoc/document';
import type { Env } from '../types';
import { heldBlobSize } from './blob-store';

export type TabBlobRefusal = 'files_unavailable' | 'blob_missing';

/**
 * Why tabs about to be written cannot be, or null: each PDF tab's stored file must be held for the document's
 * owner at the size the tab names. Tabs of every other kind name no blob and ask nothing.
 */
export async function tabBlobRefusal(
  env: Pick<Env, 'FILES'>,
  ownerId: string,
  tabs: readonly unknown[],
): Promise<TabBlobRefusal | null> {
  for (const tab of tabs) {
    const file = pdfTabOf(tab as { kind?: unknown });
    if (!file) continue;
    if (!env.FILES) {
      console.warn('[blob-store] unavailable document=- key=-');
      return 'files_unavailable';
    }
    if ((await heldBlobSize(env.FILES, ownerId, file.blob)) !== file.size) {
      console.warn(
        `[blob-store] refused name=blob_missing document=- key=${file.blob.slice(0, 8)}`,
      );
      return 'blob_missing';
    }
  }
  return null;
}

/** The response a refusal is answered with. */
export const TAB_BLOB_STATUS: Record<TabBlobRefusal, number> = {
  files_unavailable: 503,
  blob_missing: 409,
};
