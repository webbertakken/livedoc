// The template gallery's text document ids (docs/specs/034-text-documents/starting-and-finding.md "The template
// gallery's text documents"), alone, so a page can tell one from a canvas template's kind without loading the
// templates. The catalogue's test holds the two lists the same.
export const TEXT_DOCUMENT_TEMPLATE_IDS = [
  'text-letter',
  'text-formal-letter',
  'text-classic-resume',
  'text-modern-resume',
  'text-essay',
  'text-report',
  'text-notes',
  'text-project-proposal',
  'text-project-brief',
  'text-brochure',
  'text-meeting-notes',
  'text-newsletter',
  'text-lesson-plan',
  'text-class-report',
] as const;

export type TextDocumentTemplateId = (typeof TEXT_DOCUMENT_TEMPLATE_IDS)[number];

/** Whether a string names a text document template. */
export const isTextDocumentTemplateId = (
  id: string | null | undefined,
): id is TextDocumentTemplateId => TEXT_DOCUMENT_TEMPLATE_IDS.some((known) => known === id);
