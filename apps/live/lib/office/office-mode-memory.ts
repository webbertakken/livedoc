// Each person's mode while a document is open (docs/specs/034-text-documents/review.md "Editing modes": kept while the
// document is open, never stored): held by the document's page, so a surface drawn again (a drawing opened and closed,
// another tab shown and back) starts where its person left it; a new document, or a new page load, starts afresh.
import { createContext } from 'react';

/** The modes chosen while this document is open, by the surface's key (its tab). */
export type OfficeModeMemory = Map<string, string>;

/** The open document's memory; none outside a document's page (an embed), where a mode lives as long as its surface. */
export const OfficeModeMemoryContext = createContext<OfficeModeMemory | null>(null);
