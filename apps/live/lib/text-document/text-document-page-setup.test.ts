// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page setup": the locale's paper, and a setup applied to the whole
// document (every section's paper, orientation and margins; the colour the document's) as one undo step.
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { undo, ySyncPlugin } from 'y-prosemirror';
import { PageSetup, Paragraph, TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { applyPage, paperForLanguage } from './text-document-page-setup';
import { textDocumentSchema } from './text-document-schema';
import { textDocumentUndoPlugins } from './text-document-undo';

describe('paperForLanguage', () => {
  it.each([
    ['en-US', 'letter'],
    ['en-us', 'letter'],
    ['en-CA', 'letter'],
    ['fr-CA', 'letter'],
    ['es-US', 'letter'],
    ['en', 'a4'],
    ['en-GB', 'a4'],
    ['nl-NL', 'a4'],
    ['', 'a4'],
  ])('gives %s %s', (language, paper) => {
    expect(paperForLanguage(language)).toBe(paper);
  });
});

async function open(withBreak: boolean) {
  const blank = TextDocument.blank();
  const normal = (blank.body[0] as Paragraph).style;
  const landscape = {
    ...PageSetup.oriented(PageSetup.of('letter'), 'landscape'),
    columns: { count: 2, gap: 36 },
  };
  const document: TextDocument = {
    ...blank,
    body: [
      Paragraph.of('One', normal),
      ...(withBreak
        ? [{ type: 'section' as const, start: 'next-page' as const, setup: landscape }]
        : []),
      Paragraph.of('Two', normal),
    ],
  };
  const doc = TextDocumentState.load([TextDocumentState.fromDocument(document)]);
  const view = new EditorView(document_(), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { doc, view };
}
const document_ = () => document.createElement('div');

const breaks = (view: EditorView) => {
  const found: Record<string, unknown>[] = [];
  view.state.doc.forEach((node) => {
    if (node.type.name === 'section_break') found.push(node.attrs.setup as Record<string, unknown>);
  });
  return found;
};

describe('applyPage', () => {
  it('sets the first section, and each later section its paper, orientation and margins', async () => {
    const { doc, view } = await open(true);
    const a5 = {
      ...PageSetup.withPaper(PageSetup.of('letter'), 'a5'),
      margins: { top: 36, bottom: 36, left: 54, right: 54 },
      pageColor: '#fff2cc',
    };
    expect(applyPage(view, doc, 'odf', { setup: a5 })).toEqual({ sections: 2 });
    expect(TextDocumentState.section(doc, 'odf').setup).toEqual(a5);
    expect(breaks(view)).toEqual([
      {
        width: a5.width,
        height: a5.height,
        orientation: 'portrait',
        margins: a5.margins,
        columns: { count: 2, gap: 36 },
      },
    ]);
    view.destroy();
  });

  it('is one undo step', async () => {
    const { doc, view } = await open(true);
    const before = TextDocumentState.section(doc, 'odf').setup;
    const beforeBreaks = breaks(view);
    applyPage(view, doc, 'odf', { setup: PageSetup.oriented(before, 'landscape'), pageless: true });
    expect(TextDocumentState.pageless(doc)).toBe(true);
    undo(view.state);
    expect(TextDocumentState.section(doc, 'odf').setup).toEqual(before);
    expect(TextDocumentState.pageless(doc)).toBe(false);
    expect(breaks(view)).toEqual(beforeBreaks);
    view.destroy();
  });

  it('switches pageless alone, leaving the setup and sections', async () => {
    const { doc, view } = await open(true);
    const section = TextDocumentState.section(doc, 'odf');
    const beforeBreaks = breaks(view);
    expect(applyPage(view, doc, 'odf', { pageless: true })).toEqual({ sections: 0 });
    expect(TextDocumentState.pageless(doc)).toBe(true);
    expect(TextDocumentState.section(doc, 'odf')).toEqual(section);
    expect(breaks(view)).toEqual(beforeBreaks);
    undo(view.state);
    expect(TextDocumentState.pageless(doc)).toBe(false);
    view.destroy();
  });

  it('keeps the first section start and what it kept', async () => {
    const { doc, view } = await open(false);
    TextDocumentState.setSection(doc, {
      start: 'next-page',
      setup: PageSetup.of('letter'),
      kept: { attributes: [], elements: [] } as never,
    });
    applyPage(view, doc, 'odf', { setup: PageSetup.of('a4') });
    expect(TextDocumentState.section(doc, 'odf')).toMatchObject({
      start: 'next-page',
      setup: PageSetup.of('a4'),
      kept: { attributes: [], elements: [] },
    });
    view.destroy();
  });
});
