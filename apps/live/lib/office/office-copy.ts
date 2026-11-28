// The Copy document dialog's work (docs/specs/034-text-documents/files-and-print.md "Make a copy"): where a copy goes
// by default, and making it, stored on LiveDoc by the api's copy route or in This Browser by the duplicate helper.
import type { CopiedReviewChoice } from '@livedoc/text-documents';
import { apiCopyDocument } from '@/lib/api-client';
import { ApiError } from '@/lib/api/core';
import { duplicateDocument } from '@/lib/duplicate-document';

/** One of the person's own folders, as the dialog names it. */
export type CopyFolder = { id: string; name: string };

/** What the dialog asks for: the copy's name ('' for the default's), its folder and its review. */
export type CopyRequest = {
  ownerId: string;
  documentId: string;
  shareCode: string | null;
  // In This Browser: copied there, never filed in a folder.
  local: boolean;
  name: string;
  folderId: string | null;
  // Null where nothing is chosen (a Viewer's copy): the api's own rule decides.
  review: CopiedReviewChoice | null;
};

export type CopyOutcome =
  { ok: true; id: string } | { ok: false; reason: 'usage_exceeded' | 'failed' };

/**
 * The folder a copy starts in: the source's own folder for its owner, where that folder is one of theirs; else null,
 * My Documents.
 */
export function defaultCopyFolder(source: {
  isOwner: boolean;
  teamId: string | null;
  folderId: string | null;
  folders: readonly CopyFolder[];
}): string | null {
  const { isOwner, teamId, folderId, folders } = source;
  if (!isOwner || teamId !== null || folderId === null) return null;
  return folders.some((f) => f.id === folderId) ? folderId : null;
}

/** The copy made as asked, or why it was not. */
export async function copyOpenDocument(request: CopyRequest): Promise<CopyOutcome> {
  const { ownerId, documentId, shareCode, local, folderId, review } = request;
  const name = request.name.trim() || undefined;
  if (local) {
    const id = await duplicateDocument(ownerId, documentId, undefined, { name, review });
    return id ? { ok: true, id } : { ok: false, reason: 'failed' };
  }
  try {
    const copy = await apiCopyDocument(ownerId, documentId, {
      name,
      shareCode,
      folderId,
      ...(review ? { comments: review.comments, resolved: review.resolved } : {}),
    });
    return { ok: true, id: copy.id };
  } catch (error) {
    const usage = error instanceof ApiError && error.code === 'usage_exceeded';
    return { ok: false, reason: usage ? 'usage_exceeded' : 'failed' };
  }
}
