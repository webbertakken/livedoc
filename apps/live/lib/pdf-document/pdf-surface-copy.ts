// What a PDF document's surface says in its title row when a change goes wrong (marks.md "Errors";
// live-editing-and-storage.md "Limits", "A change carried across a replacement"; editing-modes.md "Errors").
import type { AccessLevel } from '@livedoc/api-schema';
import type { PdfDocumentRefusal } from './pdf-document-bus';

/** "This PDF holds the most marks LiveDoc keeps for one file (20,000)." (marks.md "Errors"). */
export const TOO_MANY_MARKS_COPY =
  'This PDF holds the most marks LiveDoc keeps for one file (20,000).';
/** Said once a change the room refused for a limit has been dropped. */
const CHANGES_DO_NOT_FIT_COPY = 'This PDF has more unsaved changes than fit.';
/** Said once a change refused for the level has been dropped. */
const VIEW_ONLY_COPY = 'You can view this PDF, but not change it.';
const REVIEW_ONLY_COPY = 'You can review this PDF, but not edit its pages.';

/** What a person is told of changes that could not be placed on a replaced stored file. */
export const lostChangesCopy = (count: number): string =>
  count === 1
    ? '1 change couldn’t be placed on the new file.'
    : `${count} changes couldn’t be placed on the new file.`;

/** What a person is told once a change the room refused has been dropped. */
export const droppedChangeCopy = (refusal: PdfDocumentRefusal, level: AccessLevel): string => {
  if (refusal !== 'level_too_low') return CHANGES_DO_NOT_FIT_COPY;
  return level === 'view' ? VIEW_ONLY_COPY : REVIEW_ONLY_COPY;
};
