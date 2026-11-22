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
  /**
   * Whether it is of a type that runs on a computer, told by its name's ending: it carries a warning line before it
   * is saved. The type the PDF names is never asked: a file can say what it likes of itself.
   */
  readonly runs: boolean;
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

/**
 * (default) The endings of names that run on a computer when opened: programs, scripts, shortcuts, and office files
 * that carry macros (security.md "Embedded files").
 */
const RUNS_ON_A_COMPUTER: ReadonlySet<string> = new Set([
  ...[
    'exe',
    'com',
    'scr',
    'msi',
    'msp',
    'dll',
    'cpl',
    'app',
    'dmg',
    'pkg',
    'deb',
    'rpm',
    'apk',
    'jar',
  ],
  ...[
    'bat',
    'cmd',
    'ps1',
    'vbs',
    'vbe',
    'js',
    'jse',
    'wsf',
    'wsh',
    'hta',
    'sh',
    'command',
    'py',
    'pl',
    'rb',
  ],
  ...['lnk', 'url', 'desktop', 'scf', 'inf', 'reg'],
  ...['docm', 'xlsm', 'pptm'],
]);

// A computer drops the dots and spaces a name ends with before it reads the ending: "run.exe. " runs.
const TRAILING = /[. ]+$/;

const runs = (name: string): boolean => {
  const read = name.replace(TRAILING, '');
  const dot = read.lastIndexOf('.');
  return dot >= 0 && RUNS_ON_A_COMPUTER.has(read.slice(dot + 1).toLowerCase());
};

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
    // Judged by the name as cleaned and before it is cut: a long name's ending is still its ending.
    const name = said.name.replace(NOT_IN_A_NAME, '').trim();
    return {
      name: name.slice(0, PDF_NAME_MAX_CHARS),
      runs: runs(name),
      size:
        said.size !== null && Number.isSafeInteger(said.size) && said.size >= 0 ? said.size : null,
      type: type.length <= TYPE_MAX_CHARS && TYPE.test(type) ? type : '',
      description: said.description.slice(0, PDF_PROPERTY_MAX_CHARS),
    };
  },
} as const;
