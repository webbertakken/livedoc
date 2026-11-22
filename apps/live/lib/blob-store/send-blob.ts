// Sending a file's bytes to the blob store (docs/specs/006-document/blob-store.md "Getting bytes in"): the store
// is asked first, so bytes it holds are never sent again; a file up to FILE_SINGLE_UPLOAD_MAX_BYTES goes in one
// request, a larger one in parts, so a dropped connection costs one part. A part that fails is sent again; a send
// that is given up and begun again resumes from the parts storage has.
import { FILE_SINGLE_UPLOAD_MAX_BYTES, filePartCount, type BlobKey } from '@livedoc/document';
import { ApiError } from '@/lib/api/core';
import {
  apiBeginBlobUpload,
  apiCompleteBlobUpload,
  apiHoldsBlob,
  apiStoreBlob,
  apiStoreBlobPart,
} from '@/lib/api/files';
import { debugLog } from '@/lib/debug-log';

/** (default) How often one part, or the complete, is tried before the send is given up. Safe range: 1 to 6. */
export const FILE_SEND_ATTEMPTS = 3;
/** (default) The wait before a part is tried again, doubled each time. Safe range: 100 to 5,000 ms. */
export const FILE_SEND_RETRY_MS = 400;

export type SendBlobOptions = {
  /** The document the bytes are for: they are then its owner's. Absent: the sender's own. */
  readonly documentId?: string;
  /** Told as bytes are confirmed stored: how many of how many. */
  readonly onProgress?: (sent: number, of: number) => void;
  /** The wait between tries; tests pass none. */
  readonly wait?: (ms: number) => Promise<void>;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// A refusal by name is the store's answer and stands; a dropped connection or a failing store is tried again.
const worthAnotherTry = (error: unknown): boolean =>
  !(error instanceof ApiError) || error.status >= 500;

async function persistently<T>(
  what: string,
  wait: (ms: number) => Promise<void>,
  send: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      if (attempt >= FILE_SEND_ATTEMPTS || !worthAnotherTry(error)) throw error;
      debugLog(`[blob-store] send-retry what=${what} attempt=${attempt}`);
      await wait(FILE_SEND_RETRY_MS * 2 ** (attempt - 1));
    }
  }
}

async function sendInParts(
  ownerId: string,
  key: BlobKey,
  bytes: Uint8Array<ArrayBuffer>,
  { documentId, onProgress, wait = sleep }: SendBlobOptions,
): Promise<{ held: boolean }> {
  const size = bytes.byteLength;
  const begun = await apiBeginBlobUpload(ownerId, key, size, documentId);
  if (begun.held) return { held: true };
  const { upload, partBytes } = begun;
  const stored = new Set(begun.parts);
  if (stored.size > 0) debugLog(`[blob-store] send-resumed have=${stored.size}`);
  const count = filePartCount(size);
  for (let n = 1; n <= count; n++) {
    const end = Math.min(n * partBytes, size);
    if (!stored.has(n)) {
      const part = bytes.subarray((n - 1) * partBytes, end);
      await persistently(`part-${n}`, wait, () =>
        apiStoreBlobPart(ownerId, key, upload, n, part, documentId),
      );
    }
    onProgress?.(end, size);
  }
  await persistently('complete', wait, () =>
    apiCompleteBlobUpload(ownerId, key, upload, documentId),
  );
  return { held: false };
}

/** Sends the bytes unless the store holds them already; `held` says it did. */
export async function sendBlob(
  ownerId: string,
  key: BlobKey,
  bytes: Uint8Array<ArrayBuffer>,
  options: SendBlobOptions = {},
): Promise<{ held: boolean }> {
  const { documentId, onProgress } = options;
  const size = bytes.byteLength;
  if (await apiHoldsBlob(ownerId, key, documentId)) return { held: true };
  if (size > FILE_SINGLE_UPLOAD_MAX_BYTES) {
    const sent = await sendInParts(ownerId, key, bytes, options);
    debugLog(`[blob-store] sent bytes=${size} parts=${filePartCount(size)} held=${sent.held}`);
    return sent;
  }
  await apiStoreBlob(ownerId, key, bytes, documentId);
  onProgress?.(size, size);
  debugLog(`[blob-store] sent bytes=${size} parts=1 held=false`);
  return { held: false };
}
