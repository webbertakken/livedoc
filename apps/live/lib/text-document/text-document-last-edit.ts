// "Last edit was …" in the save status's details (docs/specs/034-text-documents/editing-surface.md "The title row"):
// how long ago the tab's newest edit was stored, in British English, and who sent it, "Someone" where the room
// recorded no one.
import type { TextDocumentLastEditDto } from '@livedoc/api-schema';
import { VERSION_SOMEONE } from '@/lib/office/office-version-list';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = new Intl.RelativeTimeFormat('en-GB', { numeric: 'always' });

/** How long ago, in words: "just now" under a minute, else minutes, hours or days. */
export function lastEditAgo(at: number, now: number): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return ago.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return ago.format(-Math.floor(elapsed / HOUR), 'hour');
  return ago.format(-Math.floor(elapsed / DAY), 'day');
}

/** "Last edit was 5 minutes ago by Ada". */
export const lastEditWords = (edit: TextDocumentLastEditDto, now: number): string =>
  `Last edit was ${lastEditAgo(edit.at, now)} by ${edit.editor.name ?? VERSION_SOMEONE}`;
