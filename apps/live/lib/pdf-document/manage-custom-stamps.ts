// Managing their stamps (docs/specs/035-pdf-documents/custom-stamps.md "Managing them"): a stamp renamed, moved to
// another category or deleted, a category renamed (onto another, merged) or deleted with its stamps. Each is LiveDoc's
// at once, no undo; a change refused or failed is said in the dialog's words and their stamps are read again, so the
// list shows what LiveDoc holds.
import {
  PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS,
  PDF_CUSTOM_STAMP_NAME_MAX_CHARS,
  type CustomStampRecord,
} from '@livedoc/pdf-documents';
import { ApiError } from '@/lib/api/core';
import {
  apiDeleteCustomStamp,
  apiDeleteCustomStampCategory,
  apiRenameCustomStampCategory,
  apiUpdateCustomStamp,
} from '@/lib/api/custom-stamps';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { changedCustomStamp, reloadCustomStamps, replaceCustomStamps } from './custom-stamps';

/** What the dialog says of a change that did not happen. */
export const MANAGE_STAMPS_COPY = {
  failed: 'That change couldn’t be made. Try again.',
} as const;

export type StampChanged = { readonly ok: true } | { readonly ok: false; readonly problem: string };

type What = 'name' | 'category' | 'category-name' | 'stamp' | 'category-stamps';

/** A label as kept: trimmed, held to `max`; null where nothing is left, so the field goes back to what it was. */
export function labelOf(text: string, max: number): string | null {
  const label = text.trim().slice(0, max).trim();
  return label === '' ? null : label;
}

async function changed(
  ownerId: string,
  what: What,
  change: () => Promise<void>,
): Promise<StampChanged> {
  try {
    await change();
    return { ok: true };
  } catch (error) {
    const reason = error instanceof ApiError ? (error.code ?? String(error.status)) : 'network';
    debugLog(`[pdf] custom-stamp-change-failed what=${what} reason=${reason}`, String(error));
    reloadCustomStamps(ownerId);
    return { ok: false, problem: MANAGE_STAMPS_COPY.failed };
  }
}

/** A stamp renamed; nothing sent for a name that is empty or unchanged. */
export function renameCustomStamp(
  ownerId: string,
  stamp: CustomStampRecord,
  text: string,
): Promise<StampChanged> {
  const name = labelOf(text, PDF_CUSTOM_STAMP_NAME_MAX_CHARS);
  if (!name || name === stamp.name) return Promise.resolve({ ok: true });
  return changed(ownerId, 'name', async () => {
    changedCustomStamp(ownerId, stamp.id, await apiUpdateCustomStamp(ownerId, stamp.id, { name }));
    debugLog('[pdf] custom-stamp-changed what=name');
    track('Pdf', 'Changed', 'CustomStamp.Renamed');
  });
}

/** A stamp moved to another category, an existing one or a new one typed. */
export function moveCustomStamp(
  ownerId: string,
  stamp: CustomStampRecord,
  text: string,
): Promise<StampChanged> {
  const category = labelOf(text, PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS);
  if (!category || category === stamp.category) return Promise.resolve({ ok: true });
  return changed(ownerId, 'category', async () => {
    changedCustomStamp(
      ownerId,
      stamp.id,
      await apiUpdateCustomStamp(ownerId, stamp.id, { category }),
    );
    debugLog('[pdf] custom-stamp-changed what=category');
    track('Pdf', 'Changed', 'CustomStamp.Moved');
  });
}

/** A stamp deleted; its marks already placed stay. */
export function deleteCustomStamp(
  ownerId: string,
  stamp: CustomStampRecord,
): Promise<StampChanged> {
  return changed(ownerId, 'stamp', async () => {
    await apiDeleteCustomStamp(ownerId, stamp.id);
    changedCustomStamp(ownerId, stamp.id, null);
    debugLog('[pdf] custom-stamp-deleted what=stamp count=1');
    track('Pdf', 'Deleted', 'CustomStamp.Stamp');
  });
}

/** A category renamed for every stamp in it; renamed onto another of theirs, the two are one. */
export function renameCustomStampCategory(
  ownerId: string,
  category: string,
  text: string,
): Promise<StampChanged> {
  const to = labelOf(text, PDF_CUSTOM_STAMP_CATEGORY_MAX_CHARS);
  if (!to || to === category) return Promise.resolve({ ok: true });
  return changed(ownerId, 'category-name', async () => {
    replaceCustomStamps(ownerId, await apiRenameCustomStampCategory(ownerId, category, to));
    debugLog('[pdf] custom-stamp-changed what=category-name');
    track('Pdf', 'Changed', 'CustomStamp.CategoryRenamed');
  });
}

/** A category deleted with every stamp in it, as one request. */
export function deleteCustomStampCategory(
  ownerId: string,
  category: string,
  count: number,
): Promise<StampChanged> {
  return changed(ownerId, 'category-stamps', async () => {
    replaceCustomStamps(ownerId, await apiDeleteCustomStampCategory(ownerId, category));
    debugLog(`[pdf] custom-stamp-deleted what=category count=${count}`);
    track('Pdf', 'Deleted', 'CustomStamp.Category');
  });
}
