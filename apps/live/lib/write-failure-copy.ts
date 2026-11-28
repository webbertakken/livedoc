// What a failed folder or document write says (docs/specs/013-workspace/folders.md "A write that fails says so"):
// one wording per verb, shared by the Explorer page, the editor's Explorer panel and a team's library, so the same
// failure reads the same wherever it happened. Each names what it failed on when the caller knows it (toast-name.ts).
import { toastName } from './toast-name';

type FailureCopy = (name?: string | null) => string;

const failure =
  (verb: string, fallback: string): FailureCopy =>
  (name) =>
    `Could not ${verb} ${toastName(name) ?? fallback}. Try again.`;

export const FOLDER_FAILURE = {
  create: failure('create', 'the folder'),
  rename: failure('rename', 'the folder'),
  move: failure('move', 'the folder'),
  delete: failure('delete', 'the folder'),
} as const satisfies Record<string, FailureCopy>;

export const DOCUMENT_FAILURE = {
  rename: failure('rename', 'the document'),
  move: failure('move', 'the document'),
  delete: failure('delete', 'the document'),
  duplicate: failure('duplicate', 'the document'),
} as const satisfies Record<string, FailureCopy>;

/**
 * A copy of someone else's document whose files would pass what is left of the copier's file storage
 * (docs/specs/035-pdf-documents/live-editing-and-storage.md "Copies, the Trash and versions").
 */
export const COPY_DOES_NOT_FIT = "This document doesn't fit in the file storage that is left.";

/** A copy refused for any other reason (docs/specs/034-text-documents/files-and-print.md "Make a copy"). */
export const COPY_FAILED = 'The copy couldn’t be made. Try again.';

/** A copy made but left private when sharing it with the same people failed (files-and-print.md "Make a copy"). */
export const COPY_NOT_SHARED = 'The copy was made but isn’t shared. Share it from the copy.';
