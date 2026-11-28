// The forms a spreadsheet takes responses from (docs/specs/029-sheets/plan-links.md "Form responses", D506): each a
// connection an Editor of both made, naming the form's document, its Form tab and the sheet its rows land on. Kept
// on the workbook, never on a copy; a response lands only through one.
import { SHEET_ID_PATTERN } from './ids';

export type WorkbookForm = {
  readonly documentId: string;
  readonly tabId: string;
  readonly sheetId: string;
};

/** The forms a workbook keeps at most (Google sets none; a spreadsheet past this many forms is a mistake). */
export const WORKBOOK_FORMS_MAX = 20;

// A document's and a tab's ids as the api bounds them.
const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

const isForm = (raw: unknown): raw is WorkbookForm => {
  if (typeof raw !== 'object' || raw === null) return false;
  const { documentId, tabId, sheetId } = raw as Record<string, unknown>;
  return (
    typeof documentId === 'string' &&
    ID_RE.test(documentId) &&
    typeof tabId === 'string' &&
    ID_RE.test(tabId) &&
    typeof sheetId === 'string' &&
    SHEET_ID_PATTERN.test(sheetId)
  );
};

const sameForm = (a: Pick<WorkbookForm, 'documentId' | 'tabId'>, b: typeof a): boolean =>
  a.documentId === b.documentId && a.tabId === b.tabId;

export const WorkbookForms = {
  /** Connections from the wire or the room: each one, a form at most once, within the bound; null when not. */
  read: (raw: unknown): WorkbookForm[] | null => {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > WORKBOOK_FORMS_MAX) return null;
    if (!raw.every(isForm)) return null;
    const forms = raw.map(({ documentId, tabId, sheetId }) => ({ documentId, tabId, sheetId }));
    return forms.every((f, i) => forms.findIndex((g) => sameForm(f, g)) === i) ? forms : null;
  },

  /** Whether a form's rows may land on `sheetId`: the workbook keeps that form's connection to that sheet. */
  admits: (forms: readonly WorkbookForm[] | undefined, form: WorkbookForm): boolean =>
    (forms ?? []).some((f) => sameForm(f, form) && f.sheetId === form.sheetId),

  /** The connections with `form`'s made or moved to its sheet; null when that would pass the bound. */
  connect: (
    forms: readonly WorkbookForm[] | undefined,
    form: WorkbookForm,
  ): WorkbookForm[] | null => {
    const others = (forms ?? []).filter((f) => !sameForm(f, form));
    return others.length >= WORKBOOK_FORMS_MAX ? null : [...others, form];
  },

  /** The connections without one form's, or without every one to a sheet (Unlink Form). */
  unlink: (
    forms: readonly WorkbookForm[] | undefined,
    which: { form: Pick<WorkbookForm, 'documentId' | 'tabId'> } | { sheetId: string },
  ): WorkbookForm[] =>
    (forms ?? []).filter((f) =>
      'form' in which ? !sameForm(f, which.form) : f.sheetId !== which.sheetId,
    ),

  /** Whether a sheet takes responses from any form (its sheet tab's form mark). */
  takesResponses: (forms: readonly WorkbookForm[] | undefined, sheetId: string): boolean =>
    (forms ?? []).some((f) => f.sheetId === sheetId),
} as const;
