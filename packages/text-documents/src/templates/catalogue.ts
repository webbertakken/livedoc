// The template gallery's text documents (docs/specs/034-text-documents/starting-and-finding.md "The template
// gallery's text documents"): each listing of the gallery with the writing it builds. Pure.
import type { TextDocument } from '../model/text-document';
import { CLASS_REPORT, LESSON_PLAN } from './education';
import {
  TEXT_TEMPLATE_LISTINGS,
  type TextDocumentTemplateId,
  type TextTemplateSectionId,
} from './gallery';
import { FORMAL_LETTER, LETTER } from './letters';
import { ESSAY, NOTES, REPORT } from './personal';
import { CLASSIC_RESUME, MODERN_RESUME } from './resumes';
import { WORKING_BACKWARDS } from './working-backwards';
import { BROCHURE, MEETING_NOTES, NEWSLETTER, PROJECT_BRIEF, PROJECT_PROPOSAL } from './work';

/** A finished example a text document is made from: its id (`text-`), its name, its section and its writing. */
export type TextDocumentTemplate = {
  readonly id: TextDocumentTemplateId;
  readonly name: string;
  readonly section: TextTemplateSectionId;
  /** The template's text document, made fresh on every call. */
  readonly build: () => TextDocument;
};

const BUILDS: Record<TextDocumentTemplateId, () => TextDocument> = {
  'text-letter': LETTER,
  'text-formal-letter': FORMAL_LETTER,
  'text-classic-resume': CLASSIC_RESUME,
  'text-modern-resume': MODERN_RESUME,
  'text-essay': ESSAY,
  'text-report': REPORT,
  'text-notes': NOTES,
  'text-project-proposal': PROJECT_PROPOSAL,
  'text-project-brief': PROJECT_BRIEF,
  'text-working-backwards': WORKING_BACKWARDS,
  'text-brochure': BROCHURE,
  'text-meeting-notes': MEETING_NOTES,
  'text-newsletter': NEWSLETTER,
  'text-lesson-plan': LESSON_PLAN,
  'text-class-report': CLASS_REPORT,
};

/** Every template, in the gallery's order. */
export const TEXT_DOCUMENT_TEMPLATES: readonly TextDocumentTemplate[] = TEXT_TEMPLATE_LISTINGS.map(
  (listing) => ({ ...listing, build: BUILDS[listing.id] }),
);

/** The template with this id, or null. */
export const textDocumentTemplateOf = (
  id: string | null | undefined,
): TextDocumentTemplate | null => TEXT_DOCUMENT_TEMPLATES.find((t) => t.id === id) ?? null;
