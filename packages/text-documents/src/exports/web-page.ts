// Download as Web Page (docs/specs/034-text-documents/files-and-print.md "Downloading"): one HTML page in the document's
// language, titled with its name and styled from its styles, zipped with an `images/` folder holding its pictures.
import {
  downloadFileName,
  escapeXmlAttribute,
  escapeXmlText,
  writeZip,
} from '@livedoc/office-packages';
import type { TextDocument } from '../model/text-document';
import { exportTabs, tabsTitled } from './export-walk';
import { bookmarksIn, htmlWriter } from './html';
import { exportStylesheet } from './html-style';

/** The language a page names when the document names none (default). */
export const EXPORT_LANGUAGE_DEFAULT = 'en';
/** What a page is called when the document has no name. */
export const EXPORT_UNTITLED = 'Untitled';

/** The document's language as an attribute value: its own, else the default. */
export const exportLanguage = (document: TextDocument): string =>
  document.metadata.language?.trim() || EXPORT_LANGUAGE_DEFAULT;

/** The document's name, as the page and the book are titled. */
export const exportTitle = (document: TextDocument): string =>
  document.metadata.title?.trim() || EXPORT_UNTITLED;

/** The writing of every document tab as one page's body: each tab's name heading it when there are several. */
export function webPageHtml(document: TextDocument): {
  html: string;
  pictures: ReturnType<typeof htmlWriter>['pictures'];
} {
  const tabs = exportTabs(document);
  const titled = tabsTitled(tabs);
  const bookmarkFiles = new Map<string, string>();
  for (const tab of tabs) bookmarksIn(tab.body, '', bookmarkFiles);
  const writer = htmlWriter(document, { bookmarkFiles, notesFile: '' });
  const body = tabs
    .map((tab) =>
      [titled ? `<h1>${escapeXmlText(tab.name)}</h1>` : '', writer.blocks(tab.body, '')]
        .filter((part) => part !== '')
        .join('\n'),
    )
    .join('\n');
  const notes = writer.notes();
  const html = [
    '<!DOCTYPE html>',
    `<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXmlAttribute(exportLanguage(document))}">`,
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeXmlText(exportTitle(document))}</title>`,
    `<style>\n${exportStylesheet(document)}\n</style>`,
    '</head>',
    '<body>',
    ...(body ? [body] : []),
    ...(notes ? [notes] : []),
    '</body>',
    '</html>',
    '',
  ].join('\n');
  return { html, pictures: writer.pictures };
}

/** The Web Page zipped: `<name>.html`, then each picture under `images/`. */
export function writeWebPage(document: TextDocument, when: Date): Uint8Array {
  const { html, pictures } = webPageHtml(document);
  const name = downloadFileName(exportTitle(document), 'html', EXPORT_UNTITLED);
  return writeZip(
    [
      { name, data: new TextEncoder().encode(html) },
      ...pictures.used().map((picture) => ({ name: picture.path, data: picture.bytes })),
    ],
    when,
  );
}
