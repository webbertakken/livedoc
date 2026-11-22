// docs/specs/006-document/blob-store.md "Getting bytes in": an upload begins by asking; up to
// FILE_SINGLE_UPLOAD_MAX_BYTES one request, above it parts; a dropped connection costs one part; resuming.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILE_PART_BYTES,
  FILE_SINGLE_UPLOAD_MAX_BYTES,
  filePartCount,
  type BlobKey,
} from '@livedoc/document';

const api = vi.hoisted(() => ({
  apiHoldsBlob: vi.fn(),
  apiStoreBlob: vi.fn(),
  apiBeginBlobUpload: vi.fn(),
  apiStoreBlobPart: vi.fn(),
  apiCompleteBlobUpload: vi.fn(),
}));
vi.mock('@/lib/api/files', () => api);

import { ApiError } from '@/lib/api/core';
import { FILE_SEND_ATTEMPTS, FILE_SEND_RETRY_MS, sendBlob } from './send-blob';

const DOC = { documentId: 'D', shareCode: null };
const KEY = 'a'.repeat(64) as BlobKey;
const SMALL = new Uint8Array(FILE_SINGLE_UPLOAD_MAX_BYTES);
// One byte past what one request takes: five parts, the last of one byte.
const LARGE = new Uint8Array(FILE_SINGLE_UPLOAD_MAX_BYTES + 1);
const COUNT = filePartCount(LARGE.byteLength);
const waits: number[] = [];
const wait = async (ms: number) => void waits.push(ms);

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  waits.length = 0;
  api.apiHoldsBlob.mockResolvedValue(false);
  api.apiBeginBlobUpload.mockResolvedValue({ upload: 'u1', partBytes: FILE_PART_BYTES, parts: [] });
  api.apiStoreBlobPart.mockResolvedValue([]);
});

describe('sendBlob', () => {
  it('sends nothing the store already holds', async () => {
    api.apiHoldsBlob.mockResolvedValue(true);
    expect(await sendBlob('ada', KEY, LARGE, { document: DOC })).toEqual({ held: true });
    expect(api.apiHoldsBlob).toHaveBeenCalledWith('ada', KEY, DOC);
    expect(api.apiStoreBlob).not.toHaveBeenCalled();
    expect(api.apiBeginBlobUpload).not.toHaveBeenCalled();
  });

  // "A file of FILE_SINGLE_UPLOAD_MAX_BYTES goes in one request; one byte more goes in parts."
  it('sends a file of FILE_SINGLE_UPLOAD_MAX_BYTES in one request', async () => {
    const onProgress = vi.fn();
    expect(await sendBlob('ada', KEY, SMALL, { onProgress })).toEqual({ held: false });
    expect(api.apiStoreBlob).toHaveBeenCalledWith('ada', KEY, SMALL, undefined);
    expect(api.apiBeginBlobUpload).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(SMALL.byteLength, SMALL.byteLength);
  });

  it('sends one byte more in parts, in order, then completes', async () => {
    const onProgress = vi.fn();
    expect(await sendBlob('ada', KEY, LARGE, { document: DOC, onProgress })).toEqual({
      held: false,
    });
    expect(api.apiStoreBlob).not.toHaveBeenCalled();
    expect(api.apiBeginBlobUpload).toHaveBeenCalledWith('ada', KEY, LARGE.byteLength, DOC);
    type PartCall = [string, string, string, number, Uint8Array, string];
    const sent = (api.apiStoreBlobPart.mock.calls as PartCall[]).map(
      ([, , upload, n, bytes, document]) => [upload, n, bytes.byteLength, document],
    );
    expect(sent).toEqual([
      ['u1', 1, FILE_PART_BYTES, DOC],
      ['u1', 2, FILE_PART_BYTES, DOC],
      ['u1', 3, FILE_PART_BYTES, DOC],
      ['u1', 4, FILE_PART_BYTES, DOC],
      ['u1', 5, 1, DOC],
    ]);
    expect(api.apiCompleteBlobUpload).toHaveBeenCalledWith('ada', KEY, 'u1', DOC);
    expect(onProgress.mock.calls.at(-1)).toEqual([LARGE.byteLength, LARGE.byteLength]);
    expect(onProgress).toHaveBeenCalledTimes(COUNT);
  });

  // "An upload dropped after a part resumes from the next part and stores the same key."
  it('resumes from the parts storage has', async () => {
    api.apiBeginBlobUpload.mockResolvedValue({
      upload: 'u1',
      partBytes: FILE_PART_BYTES,
      parts: [1, 2, 3],
    });
    await sendBlob('ada', KEY, LARGE, { wait });
    expect(api.apiStoreBlobPart.mock.calls.map((call) => call[3] as number)).toEqual([4, 5]);
    expect(api.apiCompleteBlobUpload).toHaveBeenCalledTimes(1);
  });

  it('stops at once when beginning finds the bytes held meanwhile', async () => {
    api.apiBeginBlobUpload.mockResolvedValue({ held: true });
    expect(await sendBlob('ada', KEY, LARGE)).toEqual({ held: true });
    expect(api.apiStoreBlobPart).not.toHaveBeenCalled();
  });

  // "a dropped connection costs one part"
  it('sends a part again when the connection drops, waiting longer each time', async () => {
    api.apiStoreBlobPart
      .mockRejectedValueOnce(new TypeError('network'))
      .mockRejectedValueOnce(new ApiError('file upload part', 502, 'store_failed'));
    expect(await sendBlob('ada', KEY, LARGE, { wait })).toEqual({ held: false });
    expect(api.apiStoreBlobPart.mock.calls.map((call) => call[3] as number)).toEqual([
      1, 1, 1, 2, 3, 4, 5,
    ]);
    expect(waits).toEqual([FILE_SEND_RETRY_MS, FILE_SEND_RETRY_MS * 2]);
  });

  it('gives up a part after its tries, with what the store said', async () => {
    const dropped = new TypeError('network');
    api.apiStoreBlobPart.mockRejectedValue(dropped);
    await expect(sendBlob('ada', KEY, LARGE, { wait })).rejects.toBe(dropped);
    expect(api.apiStoreBlobPart).toHaveBeenCalledTimes(FILE_SEND_ATTEMPTS);
    expect(api.apiCompleteBlobUpload).not.toHaveBeenCalled();
  });

  it('never sends again what the store refused by name', async () => {
    const refused = new ApiError('file upload part', 400, 'part_invalid');
    api.apiStoreBlobPart.mockRejectedValue(refused);
    await expect(sendBlob('ada', KEY, LARGE, { wait })).rejects.toBe(refused);
    expect(api.apiStoreBlobPart).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('tries the complete again when the store failed it, and tells a mismatch as it is', async () => {
    api.apiCompleteBlobUpload.mockRejectedValueOnce(
      new ApiError('file upload complete', 502, 'store_failed'),
    );
    expect(await sendBlob('ada', KEY, LARGE, { wait })).toEqual({ held: false });
    expect(api.apiCompleteBlobUpload).toHaveBeenCalledTimes(2);
    const mismatch = new ApiError('file upload complete', 422, 'key_mismatch');
    api.apiCompleteBlobUpload.mockRejectedValue(mismatch);
    await expect(sendBlob('ada', KEY, LARGE, { wait })).rejects.toBe(mismatch);
  });

  it('waits by the clock between tries unless told how', async () => {
    vi.useFakeTimers();
    api.apiStoreBlobPart.mockRejectedValueOnce(new TypeError('network'));
    const sending = sendBlob('ada', KEY, LARGE);
    await vi.advanceTimersByTimeAsync(FILE_SEND_RETRY_MS);
    expect(await sending).toEqual({ held: false });
    vi.useRealTimers();
  });
});
