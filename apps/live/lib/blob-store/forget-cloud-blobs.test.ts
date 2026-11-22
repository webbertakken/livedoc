// docs/specs/006-document/blob-store.md "This Browser": "Signing out forgets them".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __setThisBrowserBlobs } from '@/lib/offline/offline-blobs';
import { forgetCloudBlobs } from './forget-cloud-blobs';

afterEach(() => __setThisBrowserBlobs(null));

describe('forgetCloudBlobs', () => {
  it('forgets every file this browser kept of cloud documents', async () => {
    const forgetCloud = vi.fn(async () => {});
    __setThisBrowserBlobs({ forgetCloud } as never);
    await forgetCloudBlobs();
    expect(forgetCloud).toHaveBeenCalledOnce();
  });

  it('never fails a sign-out when the store cannot be reached', async () => {
    __setThisBrowserBlobs({
      forgetCloud: async () => {
        throw new Error('no storage');
      },
    } as never);
    await expect(forgetCloudBlobs()).resolves.toBeUndefined();
  });
});
