// The stamp the toolbar's Stamp holds (docs/specs/035-pdf-documents/marks.md "Stamps": The Stamp control): the last
// stamp a person took, kept in their browser for every PDF; Approved until they take another.
import { STAMPS } from '@livedoc/pdf-documents';
import { createToolPick } from './pdf-tool-pick';

const pick = createToolPick<string>(
  'livedoc:v2:pdf-stamp',
  STAMPS.map((stamp) => stamp.id) as [string, ...string[]],
);

export const stampPick = pick.read;
export const setStampPick = pick.set;
export const useStampPick = pick.use;
// For tests: forget the pick read so far.
export const resetStampPick = pick.reset;
