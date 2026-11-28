// A text document's outline (docs/specs/034-text-documents/agents-and-sync.md "Reading"): its header, then each
// document tab, `◂` on the one read, with its headings two spaces in a level, each with its paragraph number and the
// paragraphs under it. A budget drops headings from the end.
import type { ViewDoor } from '@livedoc/api-schema';
import { DocumentTabs, ParagraphRefs, type TextDocument } from '@livedoc/text-documents';
import { fitLines, fitOf, type ViewLine, type ViewResult } from '../budget';
import { jsonString, plural } from '../text';
import { formatName, headingsOf, isEmptyTab, type Heading } from './reading';

export type TextDocumentOutlineJson = {
  view: 'outline';
  kind: 'text-document';
  name: string;
  format: 'odt' | 'docx';
  paragraphs: number;
  tabs: {
    id: string;
    name: string;
    current: boolean;
    paragraphs: number;
    empty: boolean;
    headings: Heading[];
  }[];
};

const HEADING_LINE = { one: 'heading', many: 'headings' };

export const headingLine = (h: Heading): string =>
  `${'  '.repeat(h.level)}${ParagraphRefs.text(h.number)} H${h.level} ${jsonString(h.text)} (${plural(
    h.paragraphs,
    'paragraph',
    'paragraphs',
  )})`;

export function textDocumentOutlineView(
  input: { name: string; document: TextDocument; current: string },
  opts: { budget?: number; door?: ViewDoor } = {},
): ViewResult<TextDocumentOutlineJson> {
  const { name, document, current } = input;
  const tabs = DocumentTabs.all(document).map((tab) => ({
    id: tab.id,
    name: tab.name,
    current: tab.id === current,
    paragraphs: ParagraphRefs.of(tab.body).length,
    empty: isEmptyTab(tab),
    headings: headingsOf(document, tab),
  }));
  const total = tabs.reduce((n, t) => n + t.paragraphs, 0);
  const header = [
    `text-document ${jsonString(name)}`,
    formatName(document),
    plural(tabs.length, 'document tab', 'document tabs'),
    plural(total, 'paragraph', 'paragraphs'),
  ].join(' · ');
  const lines: ViewLine[] = tabs.flatMap((tab): ViewLine[] => [
    { text: `tab ${jsonString(tab.name)}${tab.current ? ' ◂' : ''}` },
    ...(tab.empty
      ? [{ text: '  empty' }]
      : tab.headings.length === 0
        ? [{ text: '  no headings' }]
        : tab.headings.map((h) => ({ text: headingLine(h), noun: HEADING_LINE }))),
  ]);
  const fitted = fitLines({ header, lines, budget: opts.budget, door: opts.door ?? 'cli' });
  return {
    text: fitted.text,
    json: {
      view: 'outline',
      kind: 'text-document',
      name,
      format: formatName(document),
      paragraphs: total,
      tabs,
    },
    fit: fitOf(fitted),
  };
}
