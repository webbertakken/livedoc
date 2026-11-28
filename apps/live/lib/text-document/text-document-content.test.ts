// docs/specs/034-text-documents/starting-and-finding.md "The template gallery's text documents".
import { describe, expect, it } from 'vitest';
import { Blocks, Paragraph, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentContent, textDocumentTemplateContent } from './text-document-content';

describe('a new text document’s content', () => {
  it('is one blank text document tab', () => {
    const content = textDocumentContent('t1', 'Untitled document');
    expect(content.tab).toMatchObject({ id: 't1', name: 'Untitled document', kind: 'text-document' });
    expect(content.textDocuments).toBeUndefined();
  });
});

describe('a text document template’s content', () => {
  it('is one ODF text document tab named after the template, holding its writing', async () => {
    const made = await textDocumentTemplateContent('t1', 'text-project-brief');
    expect(made?.name).toBe('Project brief');
    expect(made?.content.tab).toMatchObject({
      id: 't1',
      name: 'Project brief',
      kind: 'text-document',
      format: 'odf',
    });
    expect(made?.content.tabs).toBeNull();
    const [seed] = made!.content.textDocuments!;
    expect(seed!.tabId).toBe('t1');
    const doc = TextDocumentState.document(TextDocumentState.load([seed!.state]), 'odf');
    expect(Paragraph.text(Blocks.paragraphs(doc.body)[0]!)).toBe('Project brief');
  });

  it('is nothing for an id no template has', async () => {
    expect(await textDocumentTemplateContent('t1', 'text-nothing')).toBeNull();
  });
});
