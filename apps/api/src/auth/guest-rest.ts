// Guest REST signature gate (docs/specs/015-api/public-api-and-tokens.md §4; docs/specs/014-identity/auth-and-guest-access.md
// "Signed guest ids").
//
// The guest `X-Owner-Id` header is a bearer value that leaks to collaborators
// (presence frames, comment authors), so on its own it proves nothing: a
// harvested id would let anyone act as that guest. On owner-scoped routes a
// presented `X-Owner-Id` must therefore carry a valid HMAC signature
// (`X-Owner-Sig`, verified with the guest signing key via
// auth/owner-signature.ts). The legitimate guest holds its signature; a
// harvester does not.
import type { Env } from '../types';
import { guestKeySecret } from './guest-key';

// Whether a guest must prove its id: whenever the host has a guest signing key,
// which is whenever sign-in is on. There is no grace window. A guest-only host
// has no key, signs nothing and requires nothing.
export function guestSignatureEnforced(env: Env): boolean {
  return guestKeySecret(env) !== null;
}

// Resource segments whose access is keyed on the resolved owner id, so a
// guest-path request to them must prove possession of that id once enforcement
// is on. Public / auth-bootstrap routes are deliberately excluded: `guest-id`
// (mints the id), `share` (share-code gated), `migrate` (verifies its own
// signature), `events` / `telemetry` / `capabilities` / `unfurl` (no owner),
// and the session-only `account` / `teams` / `tokens`.
export const OWNER_SCOPED_SEGMENTS = new Set([
  'documents',
  'folders',
  'images',
  // The blob store: an upload is stored for the resolved owner (docs/specs/006-document/blob-store.md).
  'files',
  'custom-themes',
  'shape-libraries',
  'participants',
  'preferences',
  'shared',
  // The feed is keyed on the resolved owner id and returns document
  // names + comment text, so a harvested guest id must not read it.
  'timeline',
  // Same shape as the timeline: actions + comment threads (names, text)
  // keyed on the resolved owner, and the owner's starred documents.
  'activity',
  'favourites',
  // A person's tags and what they put them on (docs/specs/013-workspace/tags.md).
  'tags',
  // Explorer Home: the person's opens, own history and others' actions, keyed on the owner.
  'home',
  // Content search: matches and lines of documents' text, keyed on the owner (docs/specs/013-workspace/content-search.md).
  'search',
  // The Trash lists deleted documents' names and restores / purges them.
  'trash',
  // A person's default folders (docs/specs/013-workspace/default-folders.md).
  'placement-defaults',
]);
