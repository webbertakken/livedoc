// /api/images — per-owner gallery + dedup'd upload + auth-gated byte
// read (docs/specs/009-elements/images.md).

import { documentRoom } from '../document-room/document-client';
import {
  deleteImage,
  documentMayServeImage,
  findImageBySha,
  getDocumentMeta,
  getImage,
  imageUsageByOwner,
  listImagesByOwner,
} from '../db';
import { ACCEPTED_IMAGE_TYPES, type AcceptedImageType } from '../image-sniff';
import {
  galleryRoom,
  hasImageStore,
  storeGalleryImage,
  type GalleryStoreRefusal,
} from '../gallery-store';
import {
  badRequest,
  conflict,
  CORS_HEADERS,
  forbidden,
  imagesUnavailable,
  json,
  notFound,
} from '../responses';
import { MAX_IMAGE_BYTES } from '../limits';
import { recordImageUploaded } from '../timeline';
import { gateGrant, requireOwner, type RouteContext } from './context';
import { parsePositiveCap } from '../positive-cap';

export { parsePositiveCap };

// What a refused store answers, in the upload's words (docs/specs/009-elements/images.md "Size cap").
function storeRefused(refusal: GalleryStoreRefusal): Response {
  switch (refusal.error) {
    case 'file_too_large':
      return json(refusal, { status: 413 });
    case 'unsupported_type':
      return json({ ...refusal, acceptedTypes: ACCEPTED_IMAGE_TYPES }, { status: 415 });
    case 'malformed_jpeg':
      return json(refusal, { status: 415 });
    case 'gallery_full':
      return json(refusal, { status: 403 });
    case 'upload_conflict':
      return conflict('upload_conflict');
  }
}

// Per-owner gallery + dedup'd upload + auth-gated byte read.
// When the R2 binding is absent (self-host without R2), every
// endpoint returns 503 so the live app can hide the feature
// without falling through to a generic 500.
export async function handleImages(ctx: RouteContext): Promise<Response> {
  const { request, env, url, segments, resolveOwner } = ctx;
  if (segments[1] !== 'images') return notFound();
  if (!hasImageStore(env)) return imagesUnavailable();

  // GET /api/images: gallery list. Owner only.
  if (segments.length === 2 && request.method === 'GET') {
    const owner = requireOwner(ctx);
    if (owner instanceof Response) return owner;
    const images = await listImagesByOwner(env, owner);
    return json({ images });
  }

  // POST /api/images: upload + dedupe. Body: raw image bytes.
  // Owner only. Server sniffs magic bytes against the
  // declared Content-Type so a forged header can't slip an
  // SVG / arbitrary file through. SHA-256 + dimensions come
  // in via headers; the server independently verifies the
  // SHA before trusting it (the dedupe key has to be the
  // body's real hash, not whatever the client claimed).
  if (segments.length === 2 && request.method === 'POST') {
    const owner = requireOwner(ctx);
    if (owner instanceof Response) return owner;
    const declaredType = (request.headers.get('Content-Type') ?? '').toLowerCase();
    if (!ACCEPTED_IMAGE_TYPES.includes(declaredType as AcceptedImageType)) {
      return json(
        {
          error: 'unsupported_type',
          acceptedTypes: ACCEPTED_IMAGE_TYPES,
        },
        { status: 415 },
      );
    }
    const declaredLen = Number(request.headers.get('Content-Length') ?? '0');
    if (!Number.isFinite(declaredLen) || declaredLen <= 0) {
      return badRequest('missing or invalid Content-Length');
    }
    if (declaredLen > MAX_IMAGE_BYTES) {
      return json({ error: 'file_too_large', limitBytes: MAX_IMAGE_BYTES }, { status: 413 });
    }
    // Early dedupe via the client-supplied SHA (docs/specs/009-elements/images.md). The client
    // computes sha256(bytes) before posting and sends it as
    // X-Image-Sha256; if a row already exists at (owner, sha) the
    // server can return the existing image without touching the
    // body. Defence: the lookup is owner-scoped, so a malicious or
    // mistyped header at most lets the caller "dedupe" against
    // their OWN image (a no-op outcome) and never crosses owners.
    // Falls through to the post-parse dedupe + insert below when
    // the header is missing or doesn't match anything.
    // Not for a workbench session or an API token: they act for the owner without being the owner's
    // own editor, and the shortcut answers a bare hash with the gallery row (id, name, size) without
    // reading a byte, so it would let them probe the gallery for any file they can hash. They upload
    // the body, and the body-hash dedupe below still answers a real duplicate.
    const headerSha = (request.headers.get('X-Image-Sha256') ?? '').toLowerCase();
    if (!ctx.workbench && !ctx.token && /^[0-9a-f]{64}$/.test(headerSha)) {
      const headerDedupe = await findImageBySha(env, owner, headerSha);
      if (headerDedupe) {
        return json({ image: headerDedupe, deduped: true });
      }
    }
    // Per-owner soft cap (docs/specs/009-elements/images.md). Enforcement order: per-file cap
    // first (above) so an oversize upload is rejected before any D1
    // round-trip; then this owner-sum check so the body parse only
    // happens for uploads that would actually land. Both caps zero
    // out when their env var is unset, which is the OSS self-host
    // default. Dedupe via the body-recomputed hash happens AFTER
    // the body parse below, so a deduped upload that would not grow
    // either total still pays the parse: that is acceptable because
    // the early X-Image-Sha256 path above already handles the common
    // dedupe case without the parse.
    const full = await galleryRoom(env, owner, declaredLen);
    if (full) return storeRefused(full);
    const width = Number(request.headers.get('X-Image-Width') ?? '0');
    const height = Number(request.headers.get('X-Image-Height') ?? '0');
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return badRequest('missing or invalid X-Image-Width / X-Image-Height');
    }
    const originalName = originalNameOf(request.headers.get('X-Image-Original-Name'));
    const stored = await storeGalleryImage(env, owner, {
      bytes: await request.arrayBuffer(),
      contentType: declaredType,
      width,
      height,
      originalName,
    });
    if (!stored.ok) {
      const { ok: _, ...refusal } = stored;
      return storeRefused(refusal);
    }
    // docs/specs/013-workspace/timeline.md §4.5: only a genuinely NEW upload, so pasting the same screenshot twice
    // is one event, and the day's uploads coalesce into one counted bubble.
    if (!stored.deduped) ctx.waitUntil?.(recordImageUploaded(env, owner));
    return json({ image: stored.image, deduped: stored.deduped });
  }

  // GET /api/images/usage: owner-only. Returns the inverse
  // index used by the Explorer Image Gallery: imageId →
  // [{ id, name }] for every owned document that references
  // it. Empty arrays for images that aren't placed on any
  // canvas yet (the entry simply doesn't appear in the map).
  // See docs/specs/013-workspace/folders.md + docs/specs/009-elements/images.md.
  if (segments.length === 3 && segments[2] === 'usage' && request.method === 'GET') {
    const owner = requireOwner(ctx);
    if (owner instanceof Response) return owner;
    const usage = await imageUsageByOwner(env, owner);
    return json({ usage });
  }

  // GET /api/images/:id: byte read. Auth: owner of the
  // image, OR caller has read access to the document named
  // by `?d=<documentId>` (owner or X-Share-Code) AND that
  // document references this image.
  if (segments.length === 3 && request.method === 'GET') {
    const imageId = segments[2]!;
    const meta = await getImage(env, imageId);
    if (!meta) return notFound();
    const callerOwner = resolveOwner();
    // A document-scope workbench session (docs/specs/013-workspace/workbench-embeds.md) never takes the owner
    // shortcut and reads through its own document only, so it cannot walk its owner's gallery by id. A workspace
    // session reaches the gallery, as the Explorer does, so it reads as its person.
    const workbench = ctx.workbench?.scope === 'document' ? ctx.workbench : null;
    let allowed = !workbench && callerOwner === meta.ownerId;
    if (!allowed) {
      const d = url.searchParams.get('d');
      if (d && (!workbench || d === workbench.documentId)) {
        // Reader must be able to read document `d` (owner OR
        // a valid share code that resolves to it), AND that
        // document must place this image AND may serve it: the
        // image's owner owns `d`, or `d` holds a placement grant
        // (a teammate's or collaborator's upload, or a copy).
        // The owner and team are all the gate needs: one row, not the full document load (its
        // participants and tab summary), which ran once for every image a visitor's board shows.
        const liveDoc = await getDocumentMeta(env, d);
        if (liveDoc) {
          // canReadDocument (owner OR any valid share code
          // mapping to this document, see auth/document-access.ts)
          // is the same access policy spelled out inline here
          // before commit 069b785 / 5527329 extracted it.
          // Reusing the helper keeps the image-read auth in
          // step with the tab-read auth automatically: a
          // future tightening of the share-code check (e.g.
          // explicit expiry, IP throttling) lands once and
          // both routes follow.
          // A tab-scoped visitor (docs/specs/013-workspace/tab-scoped-share-links.md) reads the images their
          // own tab uses, not every image in the document.
          const grant = await gateGrant(ctx, d, liveDoc.ownerId, liveDoc.teamId);
          if (grant) {
            // Placed by the document AND servable by it (docs/specs/009-elements/images.md,
            // "Placement grants"): an id pasted into an unrelated document serves nothing.
            // The place is the room's to say, the serving right D1's; both must hold.
            allowed =
              (await documentMayServeImage(env, d, imageId)) &&
              (await documentRoom(env, d).placesImage(imageId, grant.tabScope));
            if (!allowed) {
              console.warn('[images] not servable by document', { documentId: d, imageId });
            }
          }
        }
      }
    }
    if (!allowed) return notFound();
    // The request's own conditions go to R2: a browser revalidating a copy past its max-age sends its ETag, and
    // a match comes back as the object's metadata with no body.
    const object = await env.IMAGES.get(imageId, { onlyIf: request.headers });
    if (!object) return notFound();
    const headers = new Headers(CORS_HEADERS);
    headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
    // Private cache: each authorised viewer caches their own
    // copy on disk. No shared-CDN leak. The id is content-
    // addressed so cached bytes stay valid for the lifetime
    // of the row.
    headers.set('Cache-Control', 'private, max-age=86400');
    headers.set('ETag', object.httpEtag);
    // The stored type is the sniffed one; never let a browser re-guess it.
    headers.set('X-Content-Type-Options', 'nosniff');
    // The browser's copy is current: the same picture, re-authorised above, without its bytes.
    if (!('body' in object)) return new Response(null, { status: 304, headers });
    return new Response(object.body, { headers });
  }

  // DELETE /api/images/:id: gallery delete. Owner only.
  // Removes the D1 row, then the R2 object. Existing references
  // on documents stay; the renderer falls back to a broken-
  // image placeholder.
  if (segments.length === 3 && request.method === 'DELETE') {
    const imageId = segments[2]!;
    const owner = requireOwner(ctx);
    if (owner instanceof Response) return owner;
    const meta = await getImage(env, imageId);
    if (!meta) return json({ ok: true });
    if (meta.ownerId !== owner) return forbidden();
    // The row first: a row is what dedupe and the byte read trust, so it must never outlive its
    // bytes. A D1 failure throws with both still in place; an R2 failure after it leaves bytes no
    // row names (storage kept, never an id that serves nothing), logged with the id.
    await deleteImage(env, imageId);
    try {
      await env.IMAGES.delete(imageId);
    } catch (err) {
      console.error('[images] R2 delete failed after the row was removed', { imageId }, err);
    }
    return json({ ok: true });
  }

  return notFound();
}

// The longest original name kept, in characters: R2's custom metadata holds 2 KB in all, and a name past it
// made the store throw. Safe range: 100 to 300.
export const ORIGINAL_NAME_MAX = 200;

/** The uploaded file's own name: percent-encoded by the editor (a header is Latin-1 only), read raw from an
 *  older client whose name does not decode, cut to ORIGINAL_NAME_MAX characters. Null when none was sent. */
export function originalNameOf(header: string | null): string | null {
  if (header === null) return null;
  let name = header;
  try {
    name = decodeURIComponent(header);
  } catch {
    // An older client's raw name (a lone `%`): kept as sent.
  }
  return Array.from(name).slice(0, ORIGINAL_NAME_MAX).join('');
}
