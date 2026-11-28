// The documents the page previews' agreement measure lays out (docs/specs/034-text-documents/agents-and-sync.md "Page
// previews"): each laid out by the editor (the e2e fixture apps/live/e2e/office/text-document-page-starts.spec.ts,
// which records the page starts in corpus/page-starts.json) and by the previews (page-starts.test.ts). Every
// paragraph's text is unique, so a page start is named by its first paragraph's opening words.
import type { Block, Paragraph } from '../model/blocks';
import { ListDefinition } from '../model/lists';
import { PageSetup } from '../model/sections';
import { Styles, type StyleRole } from '../model/styles';
import type { Table } from '../model/tables';
import { TextDocument } from '../model/text-document';
import { readTextDocumentFile, writeTextDocumentFile } from '../files';
import { previewPageStarts } from '../previews/page-previews';

const WORDS =
  'The river runs past the mill and under the old stone bridge where the swallows nest each spring, ' +
  'and the miller listens to the wheel turn slowly through the long and quiet afternoon. ';

type Make = { para: (text: string, role?: StyleRole, extra?: Partial<Paragraph>) => Paragraph };

function maker(doc: TextDocument): Make {
  return {
    para: (text, role = 'normal', extra = {}) => ({
      type: 'paragraph',
      style: Styles.idOfRole(doc.styles, role)!,
      props: {},
      inlines: [{ type: 'run', text, props: {} }],
      ...extra,
    }),
  };
}

function essay(): TextDocument {
  const doc = TextDocument.blank({ title: 'Essay' });
  const { para } = maker(doc);
  const body: Block[] = [];
  let n = 0;
  for (let section = 1; section <= 24; section += 1) {
    body.push(para(`Section ${section}`, 'heading1'));
    for (let k = 0; k < 1 + (section % 3); k += 1)
      body.push(para(`¶${(n += 1)} ${WORDS.repeat(1 + ((section + k) % 4))}`.trim()));
  }
  return { ...doc, body };
}

function listsAndTables(): TextDocument {
  const doc = TextDocument.blank({ title: 'Lists and tables' });
  const { para } = maker(doc);
  const body: Block[] = [];
  let n = 0;
  for (let part = 1; part <= 8; part += 1) {
    body.push(para(`Part ${part}`, 'heading2'));
    body.push(para(`¶${(n += 1)} ${WORDS.repeat(2)}`.trim()));
    for (let item = 1; item <= 5; item += 1)
      body.push(
        para(`Item ${part}.${item}: ${WORDS.slice(0, 40 + item * 17)}`.trim(), 'normal', {
          list: { id: part % 2 === 0 ? 'bullets' : 'numbers', level: (item - 1) % 2 },
        }),
      );
    const table: Table = {
      type: 'table',
      columns: [120, 180, 168],
      headerRows: 1,
      rows: Array.from({ length: 6 }, (_, r) => ({
        cells: [0, 1, 2].map((c) => ({
          blocks: [
            para(`Cell ${part}.${r + 1}.${c + 1} ${c === 1 ? WORDS.slice(0, 60) : ''}`.trim()),
          ],
          props: {},
        })),
      })),
    };
    body.push(table);
  }
  return {
    ...doc,
    lists: { bullets: ListDefinition.of('bullet'), numbers: ListDefinition.of('number') },
    body,
  };
}

function a4Wide(): TextDocument {
  const doc = TextDocument.blank({ title: 'A4', paper: 'a4' });
  const { para } = maker(doc);
  const setup = PageSetup.of('a4');
  return {
    ...doc,
    section: {
      ...doc.section,
      setup: { ...setup, margins: { top: 90, bottom: 90, left: 108, right: 108 } },
    },
    body: Array.from({ length: 70 }, (_, i) =>
      para(`¶${i + 1} ${WORDS.repeat(1 + (i % 5))}`.trim(), i % 9 === 0 ? 'subtitle' : 'normal'),
    ),
  };
}

export const PAGE_START_FIXTURES: Record<string, () => TextDocument> = {
  essay,
  'lists-and-tables': listsAndTables,
  'a4-wide': a4Wide,
};

/** How a page start is named: its block's opening words (a table's first cell's). */
export function blockKey(block: Block | undefined): string {
  if (block?.type === 'table') return `table: ${blockKey(block.rows[0]?.cells[0]?.blocks[0])}`;
  if (block?.type !== 'paragraph') return block ? block.type : 'none';
  const text = block.inlines.map((i) => (i.type === 'run' ? i.text : '')).join('');
  return text.slice(0, 32);
}

/** How many pages start on the same block in both layouts, page by page, of the pages either has. */
export function agreement(
  editor: readonly string[],
  preview: readonly string[],
): { pages: number; same: number } {
  const pages = Math.max(editor.length, preview.length);
  let same = 0;
  for (let i = 0; i < pages; i += 1)
    if (editor[i] !== undefined && editor[i] === preview[i]) same += 1;
  return { pages, same };
}

/** A fixture as the editor opens it: written as a flat ODF file and read back. */
export async function openedFixture(make: () => TextDocument): Promise<{
  document: TextDocument;
  fodt: Uint8Array;
}> {
  const fodt = writeTextDocumentFile(make(), 'fodt').bytes;
  const read = await readTextDocumentFile(fodt);
  if (!read.ok) throw new Error(`the fixture does not read back: ${read.rejection}`);
  return { document: read.document, fodt };
}

/** Each page's start in the previews, named by its block. */
export const previewStartKeys = (document: TextDocument): string[] =>
  previewPageStarts(document, document.body).map((n) => blockKey(document.body[n]));
