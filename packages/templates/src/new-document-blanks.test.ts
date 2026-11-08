import { describe, expect, it } from 'vitest';
import {
  NEW_DOCUMENT_BLANKS,
  NEW_DOCUMENT_BLANK_IDS,
  newDocumentBlankOf,
  newDocumentTemplateMode,
} from './new-document-blanks';
import { TEMPLATES } from './templates';
import { isBlankTemplate, templateOpening } from './template-modes';

const known = new Set(TEMPLATES.map((t) => t.kind));

// docs/specs/013-workspace/new-document-menu.md "The blanks"
describe('New Document blanks', () => {
  it('lists the nine blanks in the menu order', () => {
    expect(NEW_DOCUMENT_BLANKS.map((b) => b.id)).toEqual([...NEW_DOCUMENT_BLANK_IDS]);
    expect(NEW_DOCUMENT_BLANKS.map((b) => b.name)).toEqual([
      'Diagram',
      'Whiteboard',
      'Brainstorm',
      'Page',
      'Sheet',
      'Board',
      'Slides',
      'Form',
      'Workshop',
    ]);
  });

  it('makes a known blank template, in the mode its templates open in', () => {
    for (const b of NEW_DOCUMENT_BLANKS) {
      expect(known.has(b.blank), b.id).toBe(true);
      expect(isBlankTemplate(b.blank), b.id).toBe(true);
      expect(templateOpening(b.blank), b.id).toBe(newDocumentTemplateMode(b.templates));
    }
  });

  it('reads an unknown id as no blank', () => {
    expect(newDocumentBlankOf('sheet')?.blank).toBe('blank-spreadsheet');
    expect(newDocumentBlankOf('dashboard')).toBeNull();
    expect(newDocumentBlankOf(null)).toBeNull();
  });
});
