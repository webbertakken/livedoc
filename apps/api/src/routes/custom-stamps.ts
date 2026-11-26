// /api/custom-stamps (docs/specs/035-pdf-documents/custom-stamps.md "API"): a person's own stamps, owner-scoped as
// custom themes are, guests included (the owner is the X-Owner-Id header where there is no session token). Each
// refusal is named; a custom stamp of another owner reads as none.
//   GET    /api/custom-stamps        the owner's, newest first
//   POST   /api/custom-stamps        one made, its picture a blob the owner already holds
//   PATCH  /api/custom-stamps/:id    renamed, or moved to another category
//   DELETE /api/custom-stamps/:id    deleted
//   GET    /api/custom-stamps/:id/picture  its picture's bytes, typed
import { CustomStamp, PDF_STAMP_MAX_BYTES, type CustomStampRecord } from '@livedoc/pdf-documents';
import {
  createCustomStamp,
  deleteCustomStamp,
  getCustomStamp,
  heldBlob,
  listCustomStamps,
  updateCustomStamp,
} from '../db';
import { readBlob } from '../blob-store/blob-store';
import { CORS_HEADERS, json, noContent, notFound } from '../responses';
import { refusedBlob, short } from './blob-door';
import { readBody, requireOwner, type RouteContext } from './context';

/** Each refusal of a custom stamp's, with its status. */
export const CUSTOM_STAMP_REFUSALS = {
  custom_stamp_invalid: 400,
  custom_stamp_exists: 409,
  too_many_custom_stamps: 409,
  custom_stamp_picture_missing: 409,
  custom_stamp_picture_too_large: 413,
  custom_stamp_not_found: 404,
} as const;
export type CustomStampRefusalName = keyof typeof CUSTOM_STAMP_REFUSALS;

function refused(name: CustomStampRefusalName, owner: string): Response {
  console.warn(`[custom-stamps] refused reason=${name} owner=${owner}`);
  return json({ error: name }, { status: CUSTOM_STAMP_REFUSALS[name] });
}

async function make(ctx: RouteContext, owner: string): Promise<Response> {
  const body = await readBody(ctx);
  if (body instanceof Response) return body;
  const read = CustomStamp.input(body);
  if (!read.ok) return refused(read.refusal, owner);
  const input = read.value;
  if (await getCustomStamp(ctx.env, input.id)) return refused('custom_stamp_exists', owner);
  const picture = await heldBlob(ctx.env, owner, input.picture.key);
  if (!picture) return refused('custom_stamp_picture_missing', owner);
  if (picture.size > PDF_STAMP_MAX_BYTES) return refused('custom_stamp_picture_too_large', owner);
  const stamp = await createCustomStamp(ctx.env, owner, input, Date.now());
  if (!stamp) return refused('too_many_custom_stamps', owner);
  console.info(`[custom-stamps] created id=${stamp.id} bytes=${picture.size}`);
  return json({ stamp }, { status: 201 });
}

async function change(ctx: RouteContext, owner: string, id: string): Promise<Response> {
  const body = await readBody(ctx);
  if (body instanceof Response) return body;
  const read = CustomStamp.patch(body);
  if (!read.ok) return refused(read.refusal, owner);
  await updateCustomStamp(ctx.env, id, read.value, Date.now());
  return json({ stamp: (await getCustomStamp(ctx.env, id))!.stamp });
}

const PICTURE_MIME = { png: 'image/png', jpeg: 'image/jpeg' } as const;

/** Its picture, to its owner: the bytes as kept, typed, kept by the browser as a blob's are. */
async function picture(
  ctx: RouteContext,
  owner: string,
  stamp: CustomStampRecord,
): Promise<Response> {
  const { key, type } = stamp.picture;
  const held = await heldBlob(ctx.env, owner, key);
  const body = held ? await readBlob(ctx.env.FILES!, held.object, null) : null;
  if (!held || !body) {
    console.error(`[custom-stamps] picture-missing id=${stamp.id} key=${short(key)}`);
    return json({ error: 'blob_missing' }, { status: 404 });
  }
  return new Response(body, {
    headers: {
      ...CORS_HEADERS,
      ETag: `"${key}"`,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Type': PICTURE_MIME[type],
      'Content-Length': String(held.size),
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function handleCustomStamps(ctx: RouteContext): Promise<Response> {
  const { request, env, segments } = ctx;
  if (segments[1] !== 'custom-stamps' || segments.length > 4) return notFound();
  if (segments.length === 4 && segments[3] !== 'picture') return notFound();
  // A custom stamp is a picture in the blob store: a deployment without one keeps none.
  if (!env.FILES) return refusedBlob('files_unavailable', {});
  const owner = requireOwner(ctx);
  if (owner instanceof Response) return owner;
  if (segments.length === 2) {
    if (request.method === 'GET') return json({ stamps: await listCustomStamps(env, owner) });
    if (request.method === 'POST') return make(ctx, owner);
    return notFound();
  }
  const id = segments[2]!;
  const kept = await getCustomStamp(env, id);
  if (!kept || kept.ownerId !== owner) return refused('custom_stamp_not_found', owner);
  if (segments.length === 4)
    return request.method === 'GET' ? picture(ctx, owner, kept.stamp) : notFound();
  if (request.method === 'PATCH') return change(ctx, owner, id);
  if (request.method === 'DELETE') {
    await deleteCustomStamp(env, id);
    console.info(`[custom-stamps] deleted id=${id}`);
    return noContent();
  }
  return notFound();
}
