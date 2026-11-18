// The server half of the name cap (docs/specs/006-document/name-length.md): every
// document and tab name the worker stores passes through here, so API-token
// callers, MCP tools and copies meet the same NAME_MAX_LENGTH the editor applies.

import { NAME_MAX_LENGTH, truncateNameTo } from '@livedoc/document';
import { SHEET_NAME_MAX } from '@livedoc/sheets';

// A spreadsheet's sheet tab is named as its sheet, up to SHEET_NAME_MAX (docs/specs/029-sheets/spreadsheet.md).
type CappedNameKind = 'document' | 'tab' | 'sheet-tab';

// Shortens a new or changed name with the shared truncateName. A name sent back
// identical to the stored one is left alone, so an autosave or reorder echoing
// a pre-cap over-long name never rewrites it (no retro-truncation).
export function capStoredName(
  incoming: string,
  stored: string | null,
  kind: CappedNameKind,
): string {
  if (stored !== null && incoming === stored) return incoming;
  const max = kind === 'sheet-tab' ? SHEET_NAME_MAX : NAME_MAX_LENGTH;
  const capped = truncateNameTo(incoming, max);
  // Log only a real cut: past the cap once whitespace is collapsed the way
  // truncateName collapses it. Tidying spaces alone is not worth a line.
  const collapsed = [...incoming.replace(/\s+/gu, ' ').trim()].length;
  if (collapsed > max) {
    console.info(`[names] capped ${kind} name`, [...incoming].length, [...capped].length);
  }
  return capped;
}
