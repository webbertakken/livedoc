// The text document's summary (docs/specs/034-text-documents/links-and-navigation.md "The summary"): a free text about
// the whole text document, kept as its metadata's description (ODF and OOXML `dc:description`).

/** The most characters a summary holds `(default)`. */
export const TEXT_DOCUMENT_SUMMARY_MAX = 2000;

export const Summary = {
  /** The text as kept: trimmed, cut to the most by character, '' for none. */
  held: (text: string): string =>
    [...text.trim()].slice(0, TEXT_DOCUMENT_SUMMARY_MAX).join('').trimEnd(),
} as const;
