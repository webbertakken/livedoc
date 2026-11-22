// An embedded file (docs/specs/035-pdf-documents/security.md "Embedded files"): a file a PDF carries inside it,
// listed by what the PDF says of it and never opened by LiveDoc. A value object made from a file's own strings, so
// every part is cleaned and bounded here.
import { PDF_NAME_MAX_CHARS, PDF_PROPERTY_MAX_CHARS } from './limits';

export type EmbeddedFile = {
  /** Its name as text: no control character, path separator or direction mark; empty where the file gives none. */
  readonly name: string;
  /** Its size in bytes as the file says it; null where the file says none. No file is decoded to be counted. */
  readonly size: number | null;
  /** The type the file names (`text/plain`); empty where it names none, or one not written as a type is. */
  readonly type: string;
  readonly description: string;
};

export type EmbeddedFiles = {
  readonly files: readonly EmbeddedFile[];
  /** Whether the PDF carries more files than were listed (`PDF_EMBEDDED_FILES_MAX`). */
  readonly cut: boolean;
};

// Control characters, the path separators, and the marks that turn the direction of text: a name such as
// "invoice\u202Efdp.exe" would otherwise show an ending it does not have.
const NOT_IN_A_NAME = /[\p{Cc}\p{Bidi_Control}/\\]/gu;
const TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const TYPE_MAX_CHARS = 127;

export type EmbeddedFileInput = {
  readonly name: string;
  readonly size: number | null;
  readonly type: string;
  readonly description: string;
};

export const EmbeddedFile = {
  /** The embedded file a PDF's own words describe, each cleaned and bounded. */
  of: (said: EmbeddedFileInput): EmbeddedFile => {
    const type = said.type.trim().toLowerCase();
    return {
      name: said.name.replace(NOT_IN_A_NAME, '').trim().slice(0, PDF_NAME_MAX_CHARS),
      size:
        said.size !== null && Number.isSafeInteger(said.size) && said.size >= 0 ? said.size : null,
      type: type.length <= TYPE_MAX_CHARS && TYPE.test(type) ? type : '',
      description: said.description.slice(0, PDF_PROPERTY_MAX_CHARS),
    };
  },
} as const;
