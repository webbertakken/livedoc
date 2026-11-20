// A person's default styles (docs/specs/034-text-documents/text-and-paragraphs.md "Default styles"): kept in their
// preferences (with their account, else this browser's guest identity), read back checked, and the text documents
// they just made starting in them when they first open (text-document-new-start.ts).
import type * as Y from 'yjs';
import {
  DefaultStyles,
  StyleLooks,
  TextDocumentState,
  type Style,
  type StyleDefaults,
} from '@livedoc/text-documents';
import type { TextDocumentFormat } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences';

/** The person's default styles; none saved, or a set that does not read back, is Google's (an empty set). */
export function readDefaultStyles(): DefaultStyles {
  const raw = readUserPreferences().textDocumentDefaultStyles;
  if (raw === undefined) return {};
  const saved = DefaultStyles.parse(raw);
  if (saved) return saved;
  console.warn('[text-document] default styles unreadable');
  return {};
}

/** Keeps a set as the person's default styles, on the freshest preferences, synced for `ownerId`. */
export function saveDefaultStyles(saved: DefaultStyles, ownerId: string | null): void {
  const { textDocumentDefaultStyles: _old, ...prefs } = readUserPreferences();
  writeUserPreferences(
    Object.keys(saved).length > 0 ? { ...prefs, textDocumentDefaultStyles: saved } : prefs,
    ownerId,
  );
  debugLog('[text-document] default styles saved', { roles: Object.keys(saved).length });
}

/** The styles a new text document's set changes to so it draws in these default styles; none for Google's. */
export function stylesForNewDocument(
  saved: DefaultStyles,
  {
    styles,
    defaults,
    format,
  }: {
    styles: readonly Style[];
    defaults: StyleDefaults;
    format: TextDocumentFormat;
  },
): Style[] {
  if (Object.keys(saved).length === 0) return [];
  return StyleLooks.restyle(styles, defaults, format, DefaultStyles.looks(saved));
}

/**
 * A text document just made here starts in its maker's default styles, before anything is typed and never as an undo
 * step (text-and-paragraphs.md "Default styles"). Answers whether it set any.
 */
export function applyDefaultStylesToNew(doc: Y.Doc, format: TextDocumentFormat): boolean {
  if (TextDocumentState.stylesType(doc).size > 0) return false;
  const changed = stylesForNewDocument(readDefaultStyles(), {
    styles: TextDocumentState.styles(doc, format),
    defaults: TextDocumentState.defaults(doc, format),
    format,
  });
  if (changed.length === 0) return false;
  TextDocumentState.setStyles(doc, format, changed);
  debugLog('[text-document] default styles applied to a new document', {
    styles: changed.length,
  });
  return true;
}
