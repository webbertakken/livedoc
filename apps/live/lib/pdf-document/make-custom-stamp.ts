// Making a custom stamp (docs/specs/035-pdf-documents/custom-stamps.md "Making one", "Errors"): its kept picture sent
// for its owner, asked first so bytes already held go nowhere, then the stamp made, kept in this browser, and joined
// to their stamps. A refusal is said in the spec's words; nothing is made by half: a picture sent for a stamp that
// was refused is the owner's until the retention sweep, as any upload no row names.
import { blobKeyOf } from '@livedoc/document';
import { PDF_CUSTOM_STAMPS_MAX, type CustomStampRecord } from '@livedoc/pdf-documents';
import { ApiError } from '@/lib/api/core';
import { apiCreateCustomStamp } from '@/lib/api/custom-stamps';
import { sendBlob } from '@/lib/blob-store/send-blob';
import { debugLog } from '@/lib/debug-log';
import { thisBrowserBlobs } from '@/lib/offline/offline-blobs';
import { track } from '@/lib/telemetry';
import type { KeptPicture, PictureRefusal } from './custom-stamp-picture';
import { rememberCustomStamp } from './custom-stamps';

/** What a person sees when a stamp is not made, by why (custom-stamps.md "Errors"). */
export const CUSTOM_STAMP_COPY = {
  unreadable: 'That picture couldn’t be read. Choose a PNG, JPEG, SVG or PDF.',
  too_large: 'That picture is too large for a stamp. Choose a smaller one.',
  too_many: `You have the most custom stamps LiveDoc keeps (${PDF_CUSTOM_STAMPS_MAX}). Delete one in Manage stamps first.`,
  files_full: 'Your files are full. Free some space, then try again.',
  failed: 'That stamp couldn’t be made. Try again.',
  not_placed: 'That stamp couldn’t be placed. Try again.',
} as const satisfies Record<
  PictureRefusal | 'too_many' | 'files_full' | 'failed' | 'not_placed',
  string
>;

export type CustomStampForm = {
  readonly picture: KeptPicture;
  readonly name: string;
  readonly category: string;
  /** "Show who and when" checked. */
  readonly dynamic: boolean;
};

export type CustomStampMade =
  | { readonly ok: true; readonly stamp: CustomStampRecord }
  | { readonly ok: false; readonly problem: string };

/** Why making it was refused, as the copy names it. */
function failureOf(error: unknown): keyof typeof CUSTOM_STAMP_COPY {
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'too_many_custom_stamps') return 'too_many';
  if (code === 'usage_exceeded') return 'files_full';
  if (code === 'custom_stamp_picture_too_large' || code === 'file_too_large') return 'too_large';
  return 'failed';
}

/** Sends its picture and makes it for `ownerId`; `id` minted by the caller, so a create sent again is the same. */
export async function makeCustomStamp(
  ownerId: string,
  form: CustomStampForm,
  id = `custom-${crypto.randomUUID()}`,
): Promise<CustomStampMade> {
  const { picture } = form;
  try {
    const key = await blobKeyOf(picture.bytes);
    await sendBlob(ownerId, key, picture.bytes);
    const stamp = await apiCreateCustomStamp(ownerId, {
      id,
      name: form.name,
      category: form.category,
      picture: { key, type: picture.type, width: picture.width, height: picture.height },
      natural: picture.natural,
      ...(form.dynamic ? { dynamic: true as const } : {}),
    });
    // Kept here, so placing it reads nothing back; a blocked keep only reads it back.
    await thisBrowserBlobs()
      .keepRead(key, picture.bytes)
      .catch((error: unknown) => debugLog('[pdf] custom-stamp-keep-skipped', String(error)));
    rememberCustomStamp(ownerId, stamp);
    debugLog(
      `[pdf] custom-stamp-made dynamic=${form.dynamic} from=${picture.source === 'pdf' ? 'pdf' : picture.source === 'svg' ? 'svg' : 'picture'} bytes=${picture.bytes.byteLength} scaled=${picture.scaled}`,
    );
    track('Pdf', 'Created', 'CustomStamp');
    return { ok: true, stamp };
  } catch (error) {
    const reason = failureOf(error);
    debugLog(`[pdf] custom-stamp-failed reason=${reason}`, String(error));
    return { ok: false, problem: CUSTOM_STAMP_COPY[reason] };
  }
}
