// A text document template and the gallery's sections (docs/specs/034-text-documents/starting-and-finding.md "The
// template gallery's text documents").
import type { TextDocument } from '../model/text-document';
import type { TextDocumentTemplateId } from './template-ids';

/** The gallery's sections, in Google's order. */
export const TEXT_TEMPLATE_SECTION_IDS = [
  'letters',
  'resumes',
  'personal',
  'work',
  'education',
] as const;
export type TextTemplateSectionId = (typeof TEXT_TEMPLATE_SECTION_IDS)[number];

/** A finished example a text document is made from: its id (`text-`), its name, its section and its writing. */
export type TextDocumentTemplate = {
  readonly id: TextDocumentTemplateId;
  readonly name: string;
  readonly section: TextTemplateSectionId;
  /** The template's text document, made fresh on every call. */
  readonly build: () => TextDocument;
};
