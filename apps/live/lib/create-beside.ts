// A new document filed beside another (docs/specs/013-workspace/default-folders.md "Duplicate"): in its team and
// folder, or, where the person may not file there, at the explicit root of My Documents. A copy and a comparison
// (docs/specs/034-text-documents/review.md "Compare documents") are filed so.
import type { DocumentPlacement } from '@livedoc/api-schema';
import { ApiError } from './api/core';

// The refusals that mean "not beside the source for this person".
const PLACE_REFUSALS: ReadonlySet<string> = new Set([
  'team_forbidden',
  'folder_not_found',
  'folder_scope_mismatch',
]);

export const EXPLICIT_ROOT: DocumentPlacement = { teamId: null, folderId: null };

/** Creates beside `place`, else at the root when the place is refused; where it was filed. Other failures throw. */
export async function createBeside(
  create: (place: DocumentPlacement) => Promise<unknown>,
  place: DocumentPlacement,
): Promise<'beside' | 'root'> {
  try {
    await create(place);
    return 'beside';
  } catch (error) {
    const code = error instanceof ApiError ? error.code : null;
    if (code === null || !PLACE_REFUSALS.has(code)) throw error;
    console.warn(`[create-beside] placement refused reason=${code}, filed at the root`);
    await create(EXPLICIT_ROOT);
    return 'root';
  }
}
