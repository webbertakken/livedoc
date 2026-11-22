// Signing out forgets every file this browser kept of cloud documents (docs/specs/006-document/blob-store.md "This
// Browser"), so a shared browser keeps no file of an account that left it. The store loads only now; a browser whose
// store cannot be reached is left as it is, and says so in its log.
import { debugLog } from '@/lib/debug-log';

export async function forgetCloudBlobs(): Promise<void> {
  try {
    const { thisBrowserBlobs } = await import('@/lib/offline/offline-blobs');
    await thisBrowserBlobs().forgetCloud();
  } catch (error) {
    debugLog('[blob-store] local-forget-failed why=sign-out', String(error));
  }
}
