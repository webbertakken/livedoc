import { describe, expect, it } from 'vitest';
import { Paragraph } from '../model/blocks';
import { Blocks } from '../model/tables';
import { readTextDocumentFile, writeTextDocumentFile } from '../files';
import { TextDocumentState } from '../text-document-state';
import {
  TEXT_DOCUMENT_TEMPLATES,
  TEXT_TEMPLATE_SECTIONS,
  textDocumentTemplateOf,
} from './catalogue';
import { isTextDocumentTemplateId, TEXT_DOCUMENT_TEMPLATE_IDS } from './template-ids';

const LETTER_WIDTH = 612;

describe('the text document template catalogue', () => {
  it('holds the spec’s fourteen templates in its order', () => {
    expect(TEXT_DOCUMENT_TEMPLATES.map((t) => t.name)).toEqual([
      'Letter',
      'Formal letter',
      'Classic resume',
      'Modern resume',
      'Essay',
      'Report',
      'Notes',
      'Project proposal',
      'Project brief',
      'Brochure',
      'Meeting notes',
      'Newsletter',
      'Lesson plan',
      'Class report',
    ]);
  });

  it('names every id with text- and keeps the ids list the same', () => {
    expect(TEXT_DOCUMENT_TEMPLATES.map((t) => t.id)).toEqual([...TEXT_DOCUMENT_TEMPLATE_IDS]);
    expect(new Set(TEXT_DOCUMENT_TEMPLATE_IDS).size).toBe(TEXT_DOCUMENT_TEMPLATE_IDS.length);
    expect(TEXT_DOCUMENT_TEMPLATE_IDS.every((id) => id.startsWith('text-'))).toBe(true);
  });

  it('groups the templates in Google’s sections', () => {
    expect(TEXT_TEMPLATE_SECTIONS.map((s) => [s.name, s.templates.map((t) => t.id)])).toEqual([
      ['Letters', ['text-letter', 'text-formal-letter']],
      ['Resumes', ['text-classic-resume', 'text-modern-resume']],
      ['Personal', ['text-essay', 'text-report', 'text-notes']],
      [
        'Work',
        [
          'text-project-proposal',
          'text-project-brief',
          'text-brochure',
          'text-meeting-notes',
          'text-newsletter',
        ],
      ],
      ['Education', ['text-lesson-plan', 'text-class-report']],
    ]);
  });

  it('finds a template by id, and nothing for another', () => {
    expect(textDocumentTemplateOf('text-notes')?.name).toBe('Notes');
    expect(textDocumentTemplateOf('kanban')).toBeNull();
    expect(textDocumentTemplateOf(null)).toBeNull();
    expect(isTextDocumentTemplateId('text-essay')).toBe(true);
    expect(isTextDocumentTemplateId('essay')).toBe(false);
    expect(isTextDocumentTemplateId(undefined)).toBe(false);
  });
});

describe.each(TEXT_DOCUMENT_TEMPLATES.map((t) => [t.name, t] as const))(
  'the %s template',
  (_, template) => {
    const doc = template.build();

    it('is born in ODF on Letter paper', () => {
      expect(doc.format).toBe('odf');
      expect(doc.section.setup.width).toBe(LETTER_WIDTH);
    });

    it('has a page of writing', () => {
      const texts = Blocks.paragraphs(doc.body).map(Paragraph.text);
      expect(texts.filter((t) => t.trim() !== '').length).toBeGreaterThan(5);
    });

    it('names only styles and lists the document holds', () => {
      const styles = new Set(doc.styles.map((s) => s.id));
      for (const p of Blocks.paragraphs(doc.body)) {
        expect(styles.has(p.style)).toBe(true);
        if (p.list) expect(doc.lists[p.list.id]).toBeDefined();
      }
    });

    it('fits its tables to the line', () => {
      const line = LETTER_WIDTH - doc.section.setup.margins.left - doc.section.setup.margins.right;
      for (const table of Blocks.tables(doc.body))
        expect(table.columns.reduce((a, b) => a + b, 0)).toBeCloseTo(line, 5);
    });

    it('keeps its writing through the live state', () => {
      const live = TextDocumentState.load([TextDocumentState.fromDocument(doc)]);
      const read = TextDocumentState.document(live, 'odf');
      expect(Blocks.paragraphs(read.body).map(Paragraph.text)).toEqual(
        Blocks.paragraphs(doc.body).map(Paragraph.text),
      );
    });

    it('writes an ODF file that reads back', async () => {
      const written = writeTextDocumentFile(doc, 'odt');
      const read = await readTextDocumentFile(written.bytes);
      expect(read.ok).toBe(true);
    });

    it('is made fresh on every call', () => {
      expect(template.build()).not.toBe(template.build());
      expect(template.build()).toEqual(template.build());
    });
  },
);
