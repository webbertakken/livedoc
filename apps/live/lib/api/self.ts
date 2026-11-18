// Participant / account calls: load self, save self, account self-
// deletion, and guest -> authed data migration.
import { debugLog } from '../debug-log';
import { dedupeInFlight } from '../dedupe';
import type { Participant } from '../identity';
import {
  API_BASE,
  apiHeaders,
  expectOkOrNull,
  expectOkVoid,
  type ParticipantResponse,
  apiFetch,
} from './core';
import { participantRead } from './open-path-requests';

// Deduped by id: the editor's hydration effect AND /live/new's
// initial fetch both call this on first paint; React Strict Mode
// in dev doubles each. With dedup, all four collapse to one fetch
// when they land in the same tick.
//
// Asked as yourself, so a profile you have not saved yet comes back as `{ participant: null }`
// rather than a 404 the browser logs as an error (docs/specs/015-api/api.md). The 404 is still read
// as no profile, for an api from before that answer.
async function _apiLoadSelf(id: string): Promise<Participant | null> {
  const { url, headers } = await participantRead(id);
  const res = await apiFetch(url, { headers });
  const participant = (await expectOkOrNull<ParticipantResponse>(res, 'load self'))?.participant;
  return participant ? participantOf(participant) : null;
}

/** A participant row as the api answers it, as the editor holds it: online, its picture left to the account. */
export function participantOf(row: { id: string; name: string; color: string }): Participant {
  return { id: row.id, name: row.name, color: row.color, status: 'online' };
}

const loadSelfOnce = dedupeInFlight(_apiLoadSelf, (id) => id);

// The participant this page last loaded or saved, briefly. /new hands the new document to the
// editor IN PLACE (docs/specs/007-editor/new-document-route.md), so the editor's identity bootstrap
// asked again for the participant /new had just read and written: one wasted round trip on every
// new document. A reload is a new page and starts empty, and presence carries any live change.
const RECENT_SELF_MS = 30_000;
let recentSelf: { participant: Participant; at: number } | null = null;
function rememberSelf(participant: Participant) {
  recentSelf = { participant, at: Date.now() };
}

function recentlyKnown(id: string): Participant | null {
  if (recentSelf?.participant.id === id && Date.now() - recentSelf.at < RECENT_SELF_MS) {
    return { ...recentSelf.participant };
  }
  return null;
}

// The rows this page is still making (docs/specs/016-platform/web-performance.md "The open path asks in parallel").
// A guest id the api minted for this page has no row until this page saves one; a save in flight answers the reads
// made while it lands (/new saves a first visitor's row as it hands the document to the editor, which reads it).
const mintedHere = new Set<string>();
const savesInFlight = new Map<string, Promise<void>>();

// Whether the api minted this guest id for this page and its row is not saved yet: there is nothing to read.
function guestMintedForThisPage(id: string): boolean {
  return mintedHere.has(id);
}

// The reader's row an open read carries (apiOpenDocument; docs/specs/016-platform/web-performance.md "The open is one
// read"), awaited in place of a read of its own. Resolves undefined when that answer carries none (an api from
// before, a document in This Browser, a failed read): then the row is read as ever. Taken once.
const readersFromOpens = new Map<string, Promise<Participant | null | undefined>>();

/** Lets the next read of this participant take the row an open read in flight carries. */
export function expectReaderFromOpen(
  id: string,
  reader: Promise<Participant | null | undefined>,
): void {
  readersFromOpens.set(id, reader);
}

async function readerFromOpen(id: string): Promise<Participant | null | undefined> {
  const pending = readersFromOpens.get(id);
  if (!pending) return undefined;
  readersFromOpens.delete(id);
  return pending;
}

export async function apiLoadSelf(id: string): Promise<Participant | null> {
  const known = recentlyKnown(id);
  if (known) return known;
  const saving = savesInFlight.get(id);
  if (saving) {
    await saving.catch(() => {});
    const saved = recentlyKnown(id);
    if (saved) {
      debugLog('[self] read answered_by=save');
      return saved;
    }
  }
  if (guestMintedForThisPage(id)) {
    debugLog('[self] read skipped reason=minted-here');
    return null;
  }
  const fromOpen = await readerFromOpen(id);
  if (fromOpen !== undefined) {
    debugLog(`[self] read answered_by=open row=${fromOpen ? 'found' : 'none'}`);
    if (fromOpen) rememberSelf(fromOpen);
    return fromOpen ? { ...fromOpen } : null;
  }
  const loaded = await loadSelfOnce(id);
  if (loaded) rememberSelf(loaded);
  return loaded;
}

// Account self-deletion (docs/specs/014-identity/auth-and-guest-access.md "Deleting an account"). One request
// removes the account's data, then its identity (the account, its sign-in methods, every session), and clears the
// session cookie. A session verified more than ten minutes ago is refused `403 SESSION_NOT_FRESH`: the caller
// verifies again (a new code) and retries once. `failed` covers everything else, and deleted nothing the person can
// tell apart from nothing. Needs the session token the registered provider attaches.
export type DeleteAccountOutcome = 'deleted' | 'not-fresh' | 'failed';

export async function apiDeleteAccount(): Promise<DeleteAccountOutcome> {
  try {
    const res = await apiFetch(`${API_BASE}/account`, {
      method: 'DELETE',
      headers: await apiHeaders(''),
    });
    if (res.ok) return 'deleted';
    if (res.status === 403) {
      const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
      if (body?.code === 'SESSION_NOT_FRESH') return 'not-fresh';
    }
    console.warn(`[account] delete_failed status=${res.status}`);
    return 'failed';
  } catch (err) {
    console.warn('[account] delete_failed reason=network', err);
    return 'failed';
  }
}

// Guest → authed ownership migration. Called once on first sign-in
// from editor-page.tsx + new/page.tsx when both conditions hold:
//   - the session is active (a Bearer token will be sent)
//   - `livedoc:v2:self-id` is still in localStorage
// On success the caller clears the localStorage id so subsequent
// loads use only the account id.
//
// The api worker (`POST /api/migrate` in `apps/api/src/index.ts`)
// requires a verified Bearer token: there is no `X-Owner-Id`
// fallback, because the whole point is to bind orphan guest data
// to an account. Returns
// `{ migrated: { documents, folders, shared, images } }`.
export async function apiMigrateGuestData(
  guestOwnerId: string,
  guestSignature: string | null,
): Promise<{ documents: number; folders: number; shared: number; images: number } | null> {
  const res = await apiFetch(`${API_BASE}/migrate`, {
    method: 'POST',
    // `apiHeaders` reads the registered token provider; the session
    // Bearer will be on every call from the editor / new-document
    // pages after they've set the provider. ownerId is unused
    // server-side for this endpoint but the helper still expects
    // it; pass the guest id to keep signatures uniform.
    headers: await apiHeaders(guestOwnerId, { body: true }),
    // The signature proves the caller owns this guest id (docs/specs/014-identity/auth-and-guest-access.md). It's
    // null for a legacy guest that never got signed — the worker then
    // rejects when signing is enforced, which is why the bootstrap
    // upgrades legacy ids to signed ones before sign-up.
    body: JSON.stringify({ guestOwnerId, guestSignature }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    migrated: { documents: number; folders: number; shared: number; images: number };
  };
  return body.migrated;
}

// Mint a SERVER-signed guest identity (docs/specs/014-identity/auth-and-guest-access.md). The worker generates the
// id — so a caller can only ever hold a signature for an id it was handed,
// never for one observed in someone else's DTO / presence — and returns
// its HMAC signature (`ownerSig` is null when the worker has no
// GUEST_ID_HMAC_SECRET configured). Returns null on a network failure so
// the caller can fall back to a local unsigned id.
export async function apiMintGuestId(): Promise<{
  ownerId: string;
  ownerSig: string | null;
} | null> {
  try {
    const res = await apiFetch(`${API_BASE}/guest-id`, {
      method: 'POST',
      headers: await apiHeaders('', { body: true }),
      body: '{}',
    });
    if (!res.ok) return null;
    const minted = (await res.json()) as { ownerId: string; ownerSig: string | null };
    mintedHere.add(minted.ownerId);
    return minted;
  } catch {
    return null;
  }
}

export async function apiSaveSelf(p: Participant): Promise<void> {
  // Owner-gated server-side as of the participants-PUT security fix.
  // The api worker requires the caller's resolved owner to match the
  // participant id being mutated — for both modes that's the same
  // value as `p.id` (a guest's localStorage UUID is also their
  // X-Owner-Id; a signed-in user's account id is also their
  // participant id, see editor-page.tsx identity bootstrap).
  const saving = (async () => {
    const res = await apiFetch(`${API_BASE}/participants/${p.id}`, {
      method: 'PUT',
      headers: await apiHeaders(p.id, { body: true }),
      body: JSON.stringify({ name: p.name, color: p.color }),
    });
    await expectOkVoid(res, 'save self');
    mintedHere.delete(p.id);
    rememberSelf({ id: p.id, name: p.name, color: p.color, status: 'online' });
  })();
  savesInFlight.set(p.id, saving);
  try {
    await saving;
  } finally {
    if (savesInFlight.get(p.id) === saving) savesInFlight.delete(p.id);
  }
}

// Tests only: a fresh page.
export function resetSelfForTests(): void {
  recentSelf = null;
  mintedHere.clear();
  savesInFlight.clear();
  readersFromOpens.clear();
}

// Publish or clear this account's profile picture (docs/specs/014-identity/profile-picture.md §6).
// account-only server-side. Returns the status so the caller can tell "no participant row yet" (404)
// from a real failure.
export async function apiSetProfilePicture(id: string, pictureUrl: string | null): Promise<number> {
  const res = await apiFetch(`${API_BASE}/participants/${id}/picture`, {
    method: 'PUT',
    headers: await apiHeaders(id, { body: true }),
    body: JSON.stringify({ pictureUrl }),
  });
  return res.status;
}
