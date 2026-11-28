// The template gallery's sections and templates by id and name (docs/specs/034-text-documents/starting-and-finding.md
// "The template gallery's text documents"), alone, so a page can lay out the gallery and tell a text document template
// from a canvas template's kind without loading the templates themselves. Pure data.
export const TEXT_TEMPLATE_SECTIONS = [
  {
    id: 'letters',
    name: 'Letters',
    templates: [
      { id: 'text-letter', name: 'Letter' },
      { id: 'text-formal-letter', name: 'Formal letter' },
    ],
  },
  {
    id: 'resumes',
    name: 'Resumes',
    templates: [
      { id: 'text-classic-resume', name: 'Classic resume' },
      { id: 'text-modern-resume', name: 'Modern resume' },
    ],
  },
  {
    id: 'personal',
    name: 'Personal',
    templates: [
      { id: 'text-essay', name: 'Essay' },
      { id: 'text-report', name: 'Report' },
      { id: 'text-notes', name: 'Notes' },
    ],
  },
  {
    id: 'work',
    name: 'Work',
    templates: [
      { id: 'text-project-proposal', name: 'Project proposal' },
      { id: 'text-project-brief', name: 'Project brief' },
      { id: 'text-working-backwards', name: 'Working backwards' },
      { id: 'text-brochure', name: 'Brochure' },
      { id: 'text-meeting-notes', name: 'Meeting notes' },
      { id: 'text-newsletter', name: 'Newsletter' },
    ],
  },
  {
    id: 'education',
    name: 'Education',
    templates: [
      { id: 'text-lesson-plan', name: 'Lesson plan' },
      { id: 'text-class-report', name: 'Class report' },
    ],
  },
] as const;

export type TextTemplateSection = (typeof TEXT_TEMPLATE_SECTIONS)[number];
export type TextTemplateSectionId = TextTemplateSection['id'];
export type TextTemplateListing = TextTemplateSection['templates'][number];
export type TextDocumentTemplateId = TextTemplateListing['id'];

/** Every template in the gallery's order. */
export const TEXT_TEMPLATE_LISTINGS: readonly (TextTemplateListing & {
  readonly section: TextTemplateSectionId;
})[] = TEXT_TEMPLATE_SECTIONS.flatMap((section) =>
  section.templates.map((t) => ({ ...t, section: section.id })),
);

export const TEXT_DOCUMENT_TEMPLATE_IDS: readonly TextDocumentTemplateId[] =
  TEXT_TEMPLATE_LISTINGS.map((t) => t.id);

/** Whether a string names a text document template. */
export const isTextDocumentTemplateId = (
  id: string | null | undefined,
): id is TextDocumentTemplateId => TEXT_DOCUMENT_TEMPLATE_IDS.some((known) => known === id);

/** A text document template's name; the gallery holds every id. */
export const textTemplateNameOf = (id: TextDocumentTemplateId): string =>
  TEXT_TEMPLATE_LISTINGS.find((t) => t.id === id)!.name;
