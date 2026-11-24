// docs/specs/034-text-documents/standard-mapping.md "Document tabs": one plain tab writes no extension; more are ODF
// top-level `text:section`s or OOXML section breaks carrying `livedoc:tab-*`, read back the same, each tab starting in
// the first section's setup; writing outside any tab joins the one before it; ids, names and depths are held;
// conversion and the live state keep them.
import { readOdfPackage, readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import { Paragraph, type Block } from './model/blocks';
import { DocumentTabs } from './model/document-tabs';
import type { TextDocument, TextDocumentFormat } from './model/text-document';
import { readLiveDocument } from './live/live-read';
import { writeLiveDocument } from './live/live-write';
import { modelOf } from './testing/compare';
import { CONSTRUCTS } from './testing/constructs';
import { fodt, W_P, W_R, docx } from './testing/packages';

type FileType = 'fodt' | 'odt' | 'docx';
const formatOf = (type: FileType): TextDocumentFormat => (type === 'docx' ? 'ooxml' : 'odf');

async function read(bytes: Uint8Array): Promise<TextDocument> {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result.document;
}

function written(document: TextDocument, type: FileType): Uint8Array {
  const result = writeTextDocumentFile(document, type);
  if (!result.ok) throw new Error(result.rejection);
  return result.bytes;
}

async function mainXml(bytes: Uint8Array, type: FileType): Promise<string> {
  if (type === 'fodt') return new TextDecoder().decode(bytes);
  if (type === 'odt') {
    const pkg = await readOdfPackage(new Uint8Array(bytes));
    if (!pkg.ok) throw new Error(pkg.rejection);
    return new TextDecoder().decode(pkg.package.entries.get('content.xml'));
  }
  const pkg = await readOoxmlPackage(new Uint8Array(bytes));
  if (!pkg.ok) throw new Error(pkg.rejection);
  return new TextDecoder().decode(pkg.package.parts.get('word/document.xml'));
}

const texts = (body: readonly Block[]) =>
  body.map((b) =>
    b.type === 'paragraph'
      ? Paragraph.text(b)
      : b.type === 'section'
        ? `[${b.start} ${b.setup.orientation}]`
        : b.type,
  );
const shape = (document: TextDocument) =>
  DocumentTabs.all(document).map((t) => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    depth: t.depth,
    body: texts(t.body),
  }));

const TYPES: FileType[] = ['fodt', 'odt', 'docx'];

describe('document tabs in a file', () => {
  for (const type of TYPES) {
    it(`writes one plain tab as an ordinary ${type}, without the extension`, async () => {
      const xml = await mainXml(written(CONSTRUCTS.text!(formatOf(type)), type), type);
      expect(xml).not.toContain('livedoc:tab-');
    });

    it(`writes the tabs to ${type} and reads them back the same: ids, names, emoji, depths, bodies`, async () => {
      const document = CONSTRUCTS.tabs!(formatOf(type));
      const again = await read(written(document, type));
      expect(shape(again)).toEqual(shape(document));
      expect(modelOf(again)).toEqual(modelOf(document));
    });

    it(`keeps one renamed tab in ${type}`, async () => {
      const document = DocumentTabs.withAll(CONSTRUCTS.text!(formatOf(type)), [
        { id: 't.0', name: 'Notes', emoji: '🗒️', depth: 0, body: [] },
      ]);
      const again = await read(
        written({ ...document, body: CONSTRUCTS.text!(formatOf(type)).body }, type),
      );
      expect(again.tabs).toEqual({ first: { id: 't.0', name: 'Notes', emoji: '🗒️' }, more: [] });
    });
  }

  it('writes ODF each tab a named top-level text:section, names made unique, the setup restored', async () => {
    const xml = await mainXml(written(CONSTRUCTS.tabs!('odf'), 'fodt'), 'fodt');
    expect(xml).toContain(
      '<text:section text:name="Overview" livedoc:tab-id="t.0" livedoc:tab-name="Overview" livedoc:tab-depth="0">',
    );
    expect(xml).toContain(
      '<text:section text:name="Details" livedoc:tab-id="t.k3x9q2m7p1zz" livedoc:tab-name="Details" livedoc:tab-depth="0" livedoc:tab-emoji="📌">',
    );
    expect(xml).toContain('text:name="Details 2" livedoc:tab-id="t.a1b2c3d4e5f6"');
    expect(xml.match(/livedoc:tab-id=/g)).toHaveLength(3);
  });

  it('writes OOXML a section break ending each tab, the body’s own sectPr the last, livedoc ignorable', async () => {
    const xml = await mainXml(written(CONSTRUCTS.tabs!('ooxml'), 'docx'), 'docx');
    expect(xml).toMatch(/mc:Ignorable="[^"]*livedoc/);
    expect(xml.match(/<w:sectPr [^>]*livedoc:tab-id=/g)).toHaveLength(3);
    expect(xml).toMatch(
      /<w:sectPr [^>]*livedoc:tab-id="t\.a1b2c3d4e5f6"[^>]*>(?:(?!<w:sectPr).)*<\/w:sectPr><\/w:body>/s,
    );
  });

  it('starts each tab in the first section’s setup, though the tab before ended in landscape', async () => {
    for (const type of TYPES) {
      const again = await read(written(CONSTRUCTS.tabs!(formatOf(type)), type));
      const [, details, subtab] = DocumentTabs.all(again);
      expect(texts(details!.body)).toEqual([
        'Details, portrait',
        '[next-page landscape]',
        'Details, landscape',
      ]);
      expect(texts(subtab!.body)).toEqual(['A subtab of the same name']);
    }
  });

  it('reads ODF writing outside any tab into the tab before it, or the first', async () => {
    const tab = (id: string, name: string, text: string) =>
      `<text:section text:name="${name}" livedoc:tab-id="${id}" livedoc:tab-name="${name}" livedoc:tab-depth="0"><text:p>${text}</text:p></text:section>`;
    const document = await read(
      fodt(
        `<text:p>Before</text:p>${tab('t.0', 'One', 'In one')}<text:p>Between</text:p>${tab('t.b', 'Two', 'In two')}<text:p>After</text:p>`,
      ),
    );
    expect(shape(document).map((t) => [t.name, t.body])).toEqual([
      ['One', ['Before', 'In one', 'Between']],
      ['Two', ['In two', 'After']],
    ]);
  });

  it('reads an ordinary text:section as no tab', async () => {
    const document = await read(
      fodt('<text:section text:name="S"><text:p>Inside</text:p></text:section>'),
    );
    expect(document.tabs).toBeUndefined();
  });

  it('holds what a file says of its tabs: ids out of form, repeated ids, missing names, deep tabs', async () => {
    // Each tab's last paragraph holds the section break ending it, as Word writes one.
    const ending = (text: string, attrs: string) =>
      W_P(`<w:pPr><w:sectPr ${attrs}><w:type w:val="continuous"/></w:sectPr></w:pPr>${W_R(text)}`);
    const document = await read(
      docx(
        `${ending('A', 'livedoc:tab-id="bad id" livedoc:tab-depth="2"')}${ending('B', 'livedoc:tab-id="t.0" livedoc:tab-depth="2"')}${W_P(W_R('C'))}<w:sectPr livedoc:tab-id="t.0" livedoc:tab-name="Last" livedoc:tab-depth="9"/>`,
      ),
    );
    expect(shape(document).map((t) => [t.id, t.name, t.depth, t.body])).toEqual([
      ['t.0', 'Tab 1', 0, ['A']],
      ['t.1', 'Tab 2', 1, ['B']],
      ['t.2', 'Last', 2, ['C']],
    ]);
  });

  it('converts the tabs between the formats, each body converted', async () => {
    for (const [from, to, type] of [
      ['odf', 'ooxml', 'docx'],
      ['ooxml', 'odf', 'odt'],
    ] as const) {
      const { document } = convertTextDocument(CONSTRUCTS.tabs!(from), to);
      expect(shape(document)).toEqual(shape(CONSTRUCTS.tabs!(from)));
      const again = await read(written(document, type));
      expect(modelOf(again)).toEqual(modelOf(document));
    }
  });
});

describe('document tabs in the live state', () => {
  it('reads back the tabs a model wrote, the first tab’s body in `body`, others in `tab:<id>`', () => {
    const doc = new Y.Doc();
    const document = CONSTRUCTS.tabs!('odf');
    writeLiveDocument(doc, document);
    expect(doc.getXmlFragment('tab:t.k3x9q2m7p1zz').length).toBe(3);
    expect(shape(readLiveDocument(doc, 'odf'))).toEqual(shape(document));
  });

  it('keeps `body` the tab t.0’s wherever it stands in the outline', () => {
    const doc = new Y.Doc();
    const [first, ...rest] = DocumentTabs.all(CONSTRUCTS.tabs!('odf'));
    const moved = DocumentTabs.withAll(CONSTRUCTS.tabs!('odf'), [rest[0]!, first!, rest[1]!]);
    writeLiveDocument(doc, moved);
    expect(doc.getXmlFragment('body').length).toBe(1);
    expect(shape(readLiveDocument(doc, 'odf'))).toEqual(shape(moved));
  });

  it('empties the fragment of a tab no longer held, and reads one plain tab after', () => {
    const doc = new Y.Doc();
    writeLiveDocument(doc, CONSTRUCTS.tabs!('odf'));
    writeLiveDocument(doc, CONSTRUCTS.text!('odf'));
    expect(doc.getXmlFragment('tab:t.k3x9q2m7p1zz').length).toBe(0);
    expect(doc.getMap('tabs').size).toBe(0);
    expect(readLiveDocument(doc, 'odf').tabs).toBeUndefined();
  });

  it('reads a map holding tabs out of rule as the rules hold them', () => {
    const doc = new Y.Doc();
    writeLiveDocument(doc, CONSTRUCTS.text!('odf'));
    doc.getMap('tabs').set('t.0', { name: '', depth: 2, order: 0 });
    doc.getMap('tabs').set('t.zz', { name: 'Deep', depth: 2, order: 1 });
    const tabs = DocumentTabs.all(readLiveDocument(doc, 'odf'));
    expect(tabs.map((t) => [t.id, t.name, t.depth])).toEqual([
      ['t.0', 'Tab 1', 0],
      ['t.zz', 'Deep', 1],
    ]);
  });
});
