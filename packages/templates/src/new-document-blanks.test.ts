import { describe, expect, it } from 'vitest';
import {
  NEW_DOCUMENT_BLANKS,
  NEW_DOCUMENT_BLANK_IDS,
  NEW_DOCUMENT_KINDS,
  isNewDocumentKind,
  newDocumentBlankOf,
  newDocumentTemplateMode,
} from './new-document-blanks';
import { TEMPLATES } from './templates';
import { isBlankTemplate, templateOpening } from './template-modes';

const known = new Set(TEMPLATES.map((t) => t.kind));

// docs/specs/013-workspace/new-document-menu.md "The blanks"
describe('New Document blanks', () => {
  it('lists the nine blanks in the menu order, the three kinds after Brainstorm', () => {
    expect(NEW_DOCUMENT_BLANKS.map((b) => b.id)).toEqual([...NEW_DOCUMENT_BLANK_IDS]);
    expect(NEW_DOCUMENT_BLANKS.map((b) => b.name)).toEqual([
      'Diagram',
      'Whiteboard',
      'Brainstorm',
      'Text document',
      'Spreadsheet',
      'PDF document',
      'Board',
      'Form',
      'Workshop',
    ]);
  });

  it('makes the three document kinds, each with its line and no templates yet', () => {
    const kinds = NEW_DOCUMENT_BLANKS.filter((b) => b.kind);
    expect(kinds.map((b) => b.kind)).toEqual([...NEW_DOCUMENT_KINDS]);
    for (const b of kinds) {
      expect(b.templates, b.id).toBeNull();
      expect(b.pitch, b.id).toBeTruthy();
    }
    expect(isNewDocumentKind('spreadsheet')).toBe(true);
    expect(isNewDocumentKind('pages')).toBe(false);
  });

  it('makes a known blank template, in the mode its templates open in', () => {
    for (const b of NEW_DOCUMENT_BLANKS) {
      if (!b.templates) continue;
      expect(known.has(b.blank), b.id).toBe(true);
      expect(isBlankTemplate(b.blank), b.id).toBe(true);
      expect(templateOpening(b.blank), b.id).toBe(newDocumentTemplateMode(b.templates));
    }
  });

  // Page, Sheet and Slides are no longer offered: a last blank that was one reads as none.
  it('reads an unknown or retired id as no blank', () => {
    expect(newDocumentBlankOf('spreadsheet')?.kind).toBe('spreadsheet');
    for (const gone of ['page', 'sheet', 'slides']) expect(newDocumentBlankOf(gone)).toBeNull();
    expect(newDocumentBlankOf('dashboard')).toBeNull();
    expect(newDocumentBlankOf(null)).toBeNull();
  });
});
