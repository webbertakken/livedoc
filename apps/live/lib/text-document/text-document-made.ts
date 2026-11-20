// The text document tabs this browser tab made and has not opened yet (docs/specs/034-text-documents/
// text-and-paragraphs.md "Default styles"): a new one starts in its maker's default styles, a file opened or someone
// else's document never does. Kept apart from the text document's code, so the places that make one load none of it.
import { debugLog } from '@/lib/debug-log';

// Per browser tab, so a reload in between still counts.
export const TEXT_DOCUMENTS_MADE_KEY = 'livedoc:v2:text-documents-made';

function readMade(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      window.sessionStorage.getItem(TEXT_DOCUMENTS_MADE_KEY) ?? '[]',
    );
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeMade(ids: readonly string[]): void {
  try {
    if (ids.length === 0) window.sessionStorage.removeItem(TEXT_DOCUMENTS_MADE_KEY);
    else window.sessionStorage.setItem(TEXT_DOCUMENTS_MADE_KEY, JSON.stringify(ids));
  } catch (error) {
    debugLog('[text-document] made list not kept', { error: String(error) });
  }
}

// At most this many made and unopened tabs are remembered; the oldest go first.
const MADE_MAX = 20;

/** Notes a text document tab just made here, so its first opening starts it in its maker's default styles. */
export function noteTextDocumentMade(tabId: string): void {
  writeMade([...readMade().filter((id) => id !== tabId), tabId].slice(-MADE_MAX));
}

/** Whether this tab was made here and not opened since; asking forgets it. */
export function takeTextDocumentMade(tabId: string): boolean {
  const made = readMade();
  if (!made.includes(tabId)) return false;
  writeMade(made.filter((id) => id !== tabId));
  return true;
}
