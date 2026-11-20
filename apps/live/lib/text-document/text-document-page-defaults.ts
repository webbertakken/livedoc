// A person's default page (docs/specs/034-text-documents/page-layout.md "Page setup", "Pageless"): its setup and
// whether it is pageless, kept in their preferences by Set as default, read back checked, and the text documents they
// just made starting on it when they first open, else on the locale's paper.
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { PageSetup, TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences';
import { paperForLanguage } from './text-document-page-setup';

export type DefaultPage = { readonly setup: PageSetup; readonly pageless: boolean };

/** The person's default page; none saved, or one that does not read back, is none. */
export function readDefaultPage(): DefaultPage | null {
  const raw = readUserPreferences().textDocumentPageSetup;
  if (raw === undefined) return null;
  const setup = PageSetup.parse(raw);
  if (!setup) {
    console.warn('[text-document] default page setup unreadable');
    return null;
  }
  return { setup, pageless: raw.pageless === true };
}

/** Keeps a setup's sides, orientation, margins and colour, and pageless, as the person's default. */
export function saveDefaultPage({ setup, pageless }: DefaultPage, ownerId: string | null): void {
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
        ...(pageless ? { pageless: true } : {}),
      },
    },
    ownerId,
  );
  debugLog('[text-document] default page setup saved', {
    paper: PageSetup.paperOf(setup),
    pageless,
  });
}

/**
 * What a new document starts on: the person's default, else the locale's paper; only what differs from what a new
 * document has, null for nothing.
 */
export function pageForNewDocument(
  saved: DefaultPage | null,
  language: string,
  format: TextDocumentFormat,
): { setup?: PageSetup; pageless?: true } | null {
  const setup = saved?.setup ?? PageSetup.of(paperForLanguage(language), format);
  const change = {
    ...(PageSetup.equal(setup, TextDocument.blank({ format }).section.setup) ? {} : { setup }),
    ...(saved?.pageless ? { pageless: true as const } : {}),
  };
  return Object.keys(change).length > 0 ? change : null;
}

/**
 * A text document just made here starts on its maker's default page, before anything is typed and never as an undo
 * step. Answers whether it set anything.
 */
export function applyDefaultPageToNew(
  doc: Y.Doc,
  format: TextDocumentFormat,
  language = typeof navigator === 'undefined' ? '' : navigator.language,
): boolean {
  const meta = TextDocumentState.metaType(doc);
  if (meta.has('section') || meta.has('pageless')) return false;
  const change = pageForNewDocument(readDefaultPage(), language, format);
  if (!change) return false;
  doc.transact(() => {
    if (change.setup)
      TextDocumentState.setSection(doc, {
        ...TextDocumentState.section(doc, format),
        setup: change.setup,
      });
    if (change.pageless) TextDocumentState.setPageless(doc, true);
  });
  debugLog('[text-document] default page setup applied to a new document', {
    paper: change.setup ? PageSetup.paperOf(change.setup) : null,
    pageless: change.pageless === true,
  });
  return true;
}
