// Where a document made on the Explorer is stored (docs/specs/006-document/save-locations.md "The default depends on
// who is creating"): LiveDoc when it is placed in a folder or a team's library, which are places on the server, else
// the default for who is creating. One answer for a new document and for a file that arrives as one.
import { signInOfferedHere } from '@/lib/auth-config';
import { defaultSaveLocationFor, type SaveLocationId } from '@/lib/save-locations';
import type { NewDocumentCreator } from './new-document-creator';

export function newDocumentLocationFor(
  place: { folderId?: string | null; teamId?: string | null },
  creator: Pick<NewDocumentCreator, 'signedIn'>,
): SaveLocationId {
  if (place.folderId || place.teamId) return 'livedoc';
  return defaultSaveLocationFor({
    signedIn: creator.signedIn,
    signInOffered: signInOfferedHere() === true,
  });
}
