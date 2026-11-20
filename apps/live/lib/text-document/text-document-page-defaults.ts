// A person's default page setup (docs/specs/034-text-documents/page-layout.md "Page setup"): kept in their preferences
// by Set as default, read back checked, and the text documents they just made starting on it when they first open,
// else on the locale's paper.
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { PageSetup, TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences';
import { paperForLanguage } from './text-document-page-setup';

/** The person's default page setup; none saved, or one that does not read back, is none. */
export function readDefaultPageSetup(): PageSetup | null {
  const raw = readUserPreferences().textDocumentPageSetup;
  if (raw === undefined) return null;
  const saved = PageSetup.parse(raw);
  if (!saved) console.warn('[text-document] default page setup unreadable');
  return saved;
}

/** Keeps a setup's sides, orientation, margins and colour as the person's default, synced for `ownerId`. */
export function saveDefaultPageSetup(setup: PageSetup, ownerId: string | null): void {
  const { width, height, orientation, margins, pageColor } = setup;
  writeUserPreferences(
    {
      ...readUserPreferences(),
      textDocumentPageSetup: {
        width,
        height,
        orientation,
        margins,
        ...(pageColor ? { pageColor } : {}),
      },
    },
    ownerId,
  );
  debugLog('[text-document] default page setup saved', { paper: PageSetup.paperOf(setup) });
}

/** The setup a new document starts on: the person's default, else the locale's paper; null where it has it already. */
export function pageSetupForNewDocument(
  saved: PageSetup | null,
  language: string,
  format: TextDocumentFormat,
): PageSetup | null {
  const setup = saved ?? PageSetup.of(paperForLanguage(language), format);
  return PageSetup.equal(setup, TextDocument.blank({ format }).section.setup) ? null : setup;
}

/**
 * A text document just made here starts on its maker's default page setup, before anything is typed and never as an
 * undo step. Answers whether it set one.
 */
export function applyDefaultPageSetupToNew(
  doc: Y.Doc,
  format: TextDocumentFormat,
  language = typeof navigator === 'undefined' ? '' : navigator.language,
): boolean {
  if (TextDocumentState.metaType(doc).has('section')) return false;
  const setup = pageSetupForNewDocument(readDefaultPageSetup(), language, format);
  if (!setup) return false;
  TextDocumentState.setSection(doc, { ...TextDocumentState.section(doc, format), setup });
  debugLog('[text-document] default page setup applied to a new document', {
    paper: PageSetup.paperOf(setup),
  });
  return true;
}
