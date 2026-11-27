// A Viewer's reading of a text document (docs/specs/034-text-documents/review.md "What a Viewer receives";
// live-editing-and-storage.md "A Viewer's copy"): the state door answers a Viewer from the room's Viewer copy. A
// catch-up from a copy the room has let go is refused, and the surface opens the tab again from the new one, so
// nothing from two copies meets in one editor; a copy that cannot be made is said, never the document shown.
import { ApiError } from '@/lib/api/core';

/** What a Viewer is shown when the room cannot make their copy (default copy). */
export const VIEWER_COPY_UNAVAILABLE_COPY = "This document can't be shown right now.";
const OPENING_FAILED_COPY = 'This text document could not be opened.';

const refusedAs = (error: unknown, code: string) =>
  error instanceof ApiError && error.code === code;

export const isViewerCopyUnavailable = (error: unknown): boolean =>
  refusedAs(error, 'viewer_copy_unavailable');

/** What the surface says when it could not open the tab. */
export const openingFailure = (error: unknown): string =>
  isViewerCopyUnavailable(error) ? VIEWER_COPY_UNAVAILABLE_COPY : OPENING_FAILED_COPY;

/** A catch-up read that asks the surface to open the tab again when the copy it holds is gone. */
export function resettingOnCopyChange<T>(
  loadSince: (vector: Uint8Array) => Promise<T>,
  reset: () => void,
): (vector: Uint8Array) => Promise<T> {
  return async (vector) => {
    try {
      return await loadSince(vector);
    } catch (error) {
      if (refusedAs(error, 'viewer_copy_changed')) reset();
      throw error;
    }
  };
}
