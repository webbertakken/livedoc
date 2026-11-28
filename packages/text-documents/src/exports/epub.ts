// Download as EPUB (docs/specs/034-text-documents/files-and-print.md "Downloading"): an EPUB 3 book of the writing, one
// chapter a Heading 1 (the writing before the first is a chapter of its own; with several document tabs each tab's
// name opens one), the contents listing the chapters, the Web Page's markup, stylesheet and pictures, and the
// footnotes in a last chapter of their own.
import {
  escapeXmlAttribute,
  escapeXmlText,
  writeZip,
  XML_DECLARATION,
} from '@livedoc/office-packages';
import { Paragraph, type Block } from '../model/blocks';
import type { TextDocument } from '../model/text-document';
import { exportContext, exportTabs, paragraphRole, tabsTitled } from './export-walk';
import { bookmarksIn, htmlWriter } from './html';
import { exportStylesheet } from './html-style';
import { exportLanguage, exportTitle } from './web-page';

export const EPUB_MEDIA_TYPE = 'application/epub+zip';
/** A chapter that opens with no Heading 1 is listed as this (default). */
export const EPUB_START_TITLE = 'Start';
/** The footnotes' chapter (default). */
export const EPUB_NOTES_TITLE = 'Notes';
const NOTES_FILE = 'notes.xhtml';

const CONTAINER = `${XML_DECLARATION}
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>
`;

/** A chapter: its title in the contents, its heading (a tab's name) and its blocks. */
type Chapter = { title: string; heading: string | null; blocks: Block[] };

/** The writing split into chapters before each Heading 1, each tab starting one when there are several. */
function chaptersOf(document: TextDocument): Chapter[] {
  const context = exportContext(document);
  const tabs = exportTabs(document);
  const titled = tabsTitled(tabs);
  const chapters: Chapter[] = [];
  for (const tab of tabs) {
    let current: Chapter | null = titled
      ? { title: tab.name, heading: tab.name, blocks: [] }
      : null;
    if (current) chapters.push(current);
    for (const block of tab.body) {
      const role = block.type === 'paragraph' ? paragraphRole(context, block) : null;
      const heading = role?.kind === 'heading' && role.level === 1;
      if (heading || !current) {
        const own = heading && block.type === 'paragraph' ? Paragraph.text(block).trim() : '';
        // A tab's opening chapter holds its first Heading 1 rather than starting another empty one.
        if (current && current.heading !== null && current.blocks.length === 0 && heading)
          current.title = own || current.title;
        else {
          current = { title: own || EPUB_START_TITLE, heading: null, blocks: [] };
          chapters.push(current);
        }
      }
      current.blocks.push(block);
    }
  }
  const kept = chapters.filter((c) => c.heading !== null || c.blocks.length > 0);
  return kept.length > 0 ? kept : [{ title: EPUB_START_TITLE, heading: null, blocks: [] }];
}

const xhtml = (language: string, title: string, body: string) =>
  [
    XML_DECLARATION,
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXmlAttribute(language)}" xml:lang="${escapeXmlAttribute(language)}">`,
    `<head><meta charset="utf-8" /><title>${escapeXmlText(title)}</title><link rel="stylesheet" type="text/css" href="style.css" /></head>`,
    `<body>${body ? `\n${body}\n` : ''}</body>`,
    '</html>',
    '',
  ].join('\n');

/** What a chapter's markup holds that its manifest entry must say: MathML, SVG. */
const propertiesOf = (markup: string) =>
  [markup.includes('<math') ? 'mathml' : '', markup.includes('<svg') ? 'svg' : '']
    .filter((p) => p !== '')
    .join(' ');

/** `dcterms:modified`: UTC to the second. */
const modified = (when: Date) => `${when.toISOString().slice(0, 19)}Z`;

export function writeEpub(
  document: TextDocument,
  { when, identifier }: { when: Date; identifier: string },
): Uint8Array {
  const language = exportLanguage(document);
  const title = exportTitle(document);
  const chapters = chaptersOf(document).map((chapter, i) => ({
    ...chapter,
    file: `chapter-${i + 1}.xhtml`,
  }));
  const bookmarkFiles = new Map<string, string>();
  for (const chapter of chapters) bookmarksIn(chapter.blocks, chapter.file, bookmarkFiles);
  const writer = htmlWriter(document, { bookmarkFiles, notesFile: NOTES_FILE });
  const written = chapters.map((chapter) => {
    const body = [
      chapter.heading === null ? '' : `<h1>${escapeXmlText(chapter.heading)}</h1>`,
      writer.blocks(chapter.blocks, chapter.file),
    ]
      .filter((part) => part !== '')
      .join('\n');
    return { ...chapter, markup: xhtml(language, chapter.title, body) };
  });
  const notesBody = writer.notes();
  const notes = notesBody
    ? {
        file: NOTES_FILE,
        title: EPUB_NOTES_TITLE,
        markup: xhtml(language, EPUB_NOTES_TITLE, notesBody),
      }
    : null;
  const pages = [...written, ...(notes ? [notes] : [])];
  const pictures = writer.pictures.used();

  const nav = xhtml(
    language,
    title,
    `<nav epub:type="toc" id="toc"><h1>${escapeXmlText(title)}</h1><ol>${pages
      .map((page) => `<li><a href="${page.file}">${escapeXmlText(page.title)}</a></li>`)
      .join('')}</ol></nav>`,
  );
  const item = (id: string, href: string, mediaType: string, properties = '') =>
    `<item id="${id}" href="${href}" media-type="${mediaType}"${properties ? ` properties="${properties}"` : ''} />`;
  const opf = [
    XML_DECLARATION,
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="${escapeXmlAttribute(language)}">`,
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `<dc:identifier id="id">${escapeXmlText(identifier)}</dc:identifier>`,
    `<dc:title>${escapeXmlText(title)}</dc:title>`,
    `<dc:language>${escapeXmlText(language)}</dc:language>`,
    `<meta property="dcterms:modified">${modified(when)}</meta>`,
    '</metadata>',
    '<manifest>',
    item('nav', 'nav.xhtml', 'application/xhtml+xml', 'nav'),
    item('style', 'style.css', 'text/css'),
    ...pages.map((page) =>
      item(
        page.file.replace('.xhtml', ''),
        page.file,
        'application/xhtml+xml',
        propertiesOf(page.markup),
      ),
    ),
    ...pictures.map((picture, i) => item(`image-${i + 1}`, picture.path, picture.mediaType)),
    '</manifest>',
    `<spine>${pages.map((page) => `<itemref idref="${page.file.replace('.xhtml', '')}" />`).join('')}</spine>`,
    '</package>',
    '',
  ].join('\n');

  const encode = (s: string) => new TextEncoder().encode(s);
  return writeZip(
    [
      { name: 'mimetype', data: encode(EPUB_MEDIA_TYPE) },
      { name: 'META-INF/container.xml', data: encode(CONTAINER) },
      { name: 'OEBPS/content.opf', data: encode(opf) },
      { name: 'OEBPS/nav.xhtml', data: encode(nav) },
      { name: 'OEBPS/style.css', data: encode(`${exportStylesheet(document)}\n`) },
      ...pages.map((page) => ({ name: `OEBPS/${page.file}`, data: encode(page.markup) })),
      ...pictures.map((picture) => ({ name: `OEBPS/${picture.path}`, data: picture.bytes })),
    ],
    when,
  );
}
