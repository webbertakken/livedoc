'use client';

// The profile picture other people may see (docs/specs/014-identity/profile-picture.md §4, §6): this
// account's resolved picture while "Show my profile picture" is on, else null. `usePublishPicture`
// writes it to the participant record whenever it changes; the room connection sends it in hello.

import { useEffect } from 'react';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import { useCachedPreferences } from '@/hooks/persistence/useEditorPreferences';
import { apiSetProfilePicture } from '@/lib/api-client';
import { showProfilePictureEnabled, type UserPreferences } from '@/lib/user-preferences';

/** Pure: what collaborators may see, given who is signed in and the switch. */
export function publishedPicture(
  signedIn: boolean,
  pictureUrl: string | null,
  prefs: UserPreferences,
): string | null {
  return signedIn && pictureUrl && showProfilePictureEnabled(prefs) ? pictureUrl : null;
}

export function usePublishedPicture(): string | null {
  const { isSignedIn, user } = useDeferredAuth();
  const prefs = useCachedPreferences();
  return publishedPicture(isSignedIn, user?.pictureUrl ?? null, prefs);
}

// What this page last wrote, per account, so a re-render or a second host never writes it twice.
const written = new Map<string, string | null>();

/** Test seam: forget what was written. */
export function resetPublishedPictureCache(): void {
  written.clear();
}

/**
 * Keep the participant record's picture equal to the published one. Runs only for a signed-in
 * account (`accountId`), after its token provider is registered. A 404 means the participant
 * row does not exist yet; the next change or page load writes it (D3).
 */
export function usePublishPicture(accountId: string | null | undefined): void {
  const picture = usePublishedPicture();
  useEffect(() => {
    if (!accountId) return;
    if (written.has(accountId) && written.get(accountId) === picture) return;
    written.set(accountId, picture);
    void apiSetProfilePicture(accountId, picture)
      .then((status) => {
        if (status >= 200 && status < 300) return;
        written.delete(accountId);
        if (status !== 404) console.warn('[profile-picture] publish failed', { status });
      })
      .catch((err: unknown) => {
        written.delete(accountId);
        console.warn('[profile-picture] publish failed', { error: String(err) });
      });
  }, [accountId, picture]);
}
