// The template gallery's text documents in their sections (docs/specs/034-text-documents/starting-and-finding.md "The
// template gallery's text documents"), in the spec's order. Pure data.
import { CLASS_REPORT, LESSON_PLAN } from './education';
import { FORMAL_LETTER, LETTER } from './letters';
import { ESSAY, NOTES, REPORT } from './personal';
import { CLASSIC_RESUME, MODERN_RESUME } from './resumes';
import {
  TEXT_TEMPLATE_SECTION_IDS,
  type TextDocumentTemplate,
  type TextTemplateSectionId,
} from './template-types';
import { BROCHURE, MEETING_NOTES, NEWSLETTER, PROJECT_BRIEF, PROJECT_PROPOSAL } from './work';

export const TEXT_DOCUMENT_TEMPLATES: readonly TextDocumentTemplate[] = [
  LETTER,
  FORMAL_LETTER,
  CLASSIC_RESUME,
  MODERN_RESUME,
  ESSAY,
  REPORT,
  NOTES,
  PROJECT_PROPOSAL,
  PROJECT_BRIEF,
  BROCHURE,
  MEETING_NOTES,
  NEWSLETTER,
  LESSON_PLAN,
  CLASS_REPORT,
];

const SECTION_NAMES: Record<TextTemplateSectionId, string> = {
  letters: 'Letters',
  resumes: 'Resumes',
  personal: 'Personal',
  work: 'Work',
  education: 'Education',
};

export type TextTemplateSection = {
  readonly id: TextTemplateSectionId;
  readonly name: string;
  readonly templates: readonly TextDocumentTemplate[];
};

/** The gallery's sections, each with its templates, in order. */
export const TEXT_TEMPLATE_SECTIONS: readonly TextTemplateSection[] = TEXT_TEMPLATE_SECTION_IDS.map(
  (id) => ({
    id,
    name: SECTION_NAMES[id],
    templates: TEXT_DOCUMENT_TEMPLATES.filter((t) => t.section === id),
  }),
);

/** The template with this id, or null. */
export const textDocumentTemplateOf = (
  id: string | null | undefined,
): TextDocumentTemplate | null => TEXT_DOCUMENT_TEMPLATES.find((t) => t.id === id) ?? null;
