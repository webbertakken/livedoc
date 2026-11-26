// One text document per construct group of the mapping (standard-mapping.md "What the model holds"), in either
// format: what the writers and readers are proven on, and what the validation script writes and checks against each
// format's schema (office-packages.md "Validation"). Test-only; never shipped.
import type { Block, Paragraph } from '../model/blocks';
import type { BorderDash, BorderLine } from '../model/props';
import type { Table, TableCell } from '../model/tables';
import type { Picture } from '../model/pictures';
import type { Equation, MathNode, MathRow } from '../model/equations';
import { BLUE_PNG, BLUE_PNG_SHA, GREEN_PNG, GREEN_PNG_SHA } from './pictures';
import { ListDefinition } from '../model/lists';
import { ListPresets } from '../model/list-presets';
import { PageSetup } from '../model/sections';
import { Styles } from '../model/styles';
import { TextDocument, type TextDocumentFormat } from '../model/text-document';

const run = (text: string, props = {}, extra = {}) => ({
  type: 'run' as const,
  text,
  props,
  ...extra,
});

function paragraph(
  format: TextDocumentFormat,
  role: Parameters<typeof Styles.idOfRole>[1],
  inlines: Paragraph['inlines'],
  extra: Partial<Paragraph> = {},
): Paragraph {
  const style = Styles.idOfRole(Styles.builtIn(format), role)!;
  return { type: 'paragraph', style, props: {}, inlines, ...extra };
}

const base = (
  format: TextDocumentFormat,
  body: Block[],
  extra: Partial<TextDocument> = {},
): TextDocument => ({
  ...TextDocument.blank({ format, title: 'Constructs' }),
  body,
  ...extra,
});

export const CONSTRUCTS: Record<string, (format: TextDocumentFormat) => TextDocument> = {
  blank: (format) => TextDocument.blank({ format }),
  text: (format) =>
    base(format, [
      paragraph(format, 'normal', [
        run('plain, '),
        run('bold', { bold: true }),
        run(' not bold', {
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          smallCaps: false,
        }),
        run('italic underline strike', { italic: true, underline: true, strike: true }),
        run('super', { vertical: 'super' }),
        run('sub', { vertical: 'sub' }),
        run('base', { vertical: 'baseline' }),
        run('Georgia 14 red on yellow', {
          font: 'Georgia',
          size: 14,
          color: '#cc0000',
          highlight: '#ffff00',
        }),
        run('custom highlight', { highlight: '#d9ead3' }),
        run('Small Caps', { smallCaps: true }),
        run('UPPER', { transform: 'uppercase' }),
        run('none', { transform: 'none' }),
        run(' Times New Roman ', { font: 'Times New Roman' }),
      ]),
      paragraph(format, 'normal', [
        run('  two leading spaces, a\ttab,   three spaces and a\nline break  '),
      ]),
      paragraph(format, 'normal', [run('Ünïcödé ✓ 😀 <tags> & "quotes"')]),
      ...(format === 'odf'
        ? [
            paragraph(
              format,
              'normal',
              [
                run('lower', { transform: 'lowercase' }),
                run('title case', { transform: 'capitalize' }),
              ],
              { text: { italic: true } },
            ),
          ]
        : []),
    ]),
  paragraphs: (format) =>
    base(format, [
      paragraph(format, 'title', [run('Title')]),
      paragraph(format, 'subtitle', [run('Subtitle')]),
      ...(['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6'] as const).map(
        (role, i) => paragraph(format, role, [run(`Heading ${i + 1}`)]),
      ),
      paragraph(format, 'heading2', [run('A heading style, not in the outline')], {
        props: { outlineLevel: 0 },
      }),
      paragraph(format, 'normal', [run('Normal text at outline level 3')], {
        props: { outlineLevel: 3 },
      }),
      paragraph(format, 'normal', [run('Centred, 1.5 lines, 12 pt before, 6 after')], {
        props: {
          align: 'center',
          lineHeight: { rule: 'multiple', value: 1.5 },
          spaceBefore: 12,
          spaceAfter: 6,
        },
      }),
      paragraph(format, 'normal', [run('Right, exact 18 pt')], {
        props: { align: 'end', lineHeight: { rule: 'exact', pt: 18 } },
      }),
      paragraph(format, 'normal', [run('Justified, at least 14 pt, indented')], {
        props: {
          align: 'justify',
          lineHeight: { rule: 'atLeast', pt: 14 },
          indentStart: 36,
          indentEnd: 18,
          indentFirst: 18,
        },
      }),
      paragraph(format, 'normal', [run('Hanging indent')], {
        props: { indentStart: 36, indentFirst: -18, align: 'start' },
      }),
      paragraph(format, 'normal', [run('Keep rules on')], {
        props: { keepWithNext: true, keepTogether: true, widowControl: true },
      }),
      paragraph(format, 'normal', [run('Keep rules off')], {
        props: {
          keepWithNext: false,
          keepTogether: false,
          widowControl: false,
          pageBreakBefore: false,
        },
      }),
      paragraph(format, 'normal', [run('After a page break')], {
        props: { pageBreakBefore: true },
      }),
    ]),
  // text-and-paragraphs.md "Borders and shading"; an OpenDocument file has no line between paragraphs.
  borders: (format) =>
    base(format, [
      paragraph(format, 'normal', [run('Boxed, shaded')], {
        props: {
          borders: Object.fromEntries(
            (['top', 'bottom', 'left', 'right'] as const).map((side) => [
              side,
              { width: 1, dash: 'solid', color: '#000000', space: 4 },
            ]),
          ),
          shading: '#fff2cc',
        },
      }),
      paragraph(format, 'normal', [run('A dotted rule above, a dashed one below')], {
        props: {
          borders: {
            top: { width: 0.5, dash: 'dotted', color: '#1155cc', space: 1 },
            bottom: { width: 6, dash: 'dashed', color: '#cc0000', space: 0 },
            ...(format === 'ooxml'
              ? { between: { width: 2, dash: 'solid', color: '#999999', space: 0 } }
              : {}),
          },
        },
      }),
    ]),
  // text-and-paragraphs.md "Tab stops": every alignment and leader, and the default stops.
  'tab-stops': (format) =>
    base(format, [
      paragraph(format, 'normal', [run('Name\tDate\tTotal\t12.50')], {
        props: {
          indentStart: 18,
          tabStops: [
            { position: 72, align: 'start', leader: 'dot' },
            { position: 216, align: 'center', leader: 'hyphen' },
            { position: 360, align: 'end', leader: 'underscore' },
            { position: 432, align: 'decimal' },
          ],
        },
      }),
      paragraph(format, 'normal', [run('Default stops\tevery half inch')]),
    ]),
  styles: (format) => {
    const doc = TextDocument.blank({ format });
    const normal = Styles.idOfRole(doc.styles, 'normal')!;
    return {
      ...doc,
      styles: [
        ...doc.styles,
        {
          id: 'Quote',
          name: 'Quote',
          family: 'paragraph',
          parent: normal,
          next: normal,
          paragraph: { indentStart: 36, indentEnd: 36 },
          text: { italic: true, color: '#434343' },
        },
        {
          id: 'Code',
          name: 'Code',
          family: 'text',
          paragraph: {},
          text: { font: 'Courier New', size: 10 },
        },
      ],
      body: [
        {
          type: 'paragraph',
          style: 'Quote',
          props: {},
          inlines: [
            run('A quote, with '),
            run('code', {}, { style: 'Code' }),
            run(' and '),
            run('bold code', { bold: true }, { style: 'Code' }),
          ],
        },
      ],
    };
  },
  lists: (format) => {
    const p = (text: string, id: string, level: number, extra = {}) =>
      paragraph(format, 'normal', [run(text)], { list: { id, level, ...extra } });
    const roman = ListDefinition.of('number');
    return base(
      format,
      [
        p('Bullet', '1', 0),
        p('Nested bullet', '1', 1),
        p('Deep bullet', '1', 2),
        p('Back out', '1', 0),
        p('One', '2', 0),
        p('Two', '2', 0),
        p('Two a', '2', 1),
        paragraph(format, 'normal', [run('Between')]),
        p('Three, continued', '2', 0),
        p('Open task', '3', 0),
        p('Done task', '3', 0, { checked: true }),
        p('Jumps to level two', '4', 2),
        p('Restarted at five', '2', 0, { restart: 5 }),
        p('Counts on from five', '2', 0),
        p('Restarted deeper at zero', '2', 1, { restart: 0 }),
        p('Ticked, not struck', '5', 0, { checked: true }),
        ...(format === 'odf'
          ? [p('A second paragraph of the item', '2', 0, { unnumbered: true })]
          : []),
      ],
      {
        lists: {
          '1': ListDefinition.of('bullet'),
          '2': {
            levels: roman.levels.map((l, i) =>
              i === 0 && l.kind === 'number'
                ? { ...l, format: 'upper-roman' as const, label: '(%1)' }
                : i === 1 && l.kind === 'number'
                  ? { ...l, label: '%1.%2.', format: 'upper-letter' as const, start: 3 }
                  : l,
            ),
          },
          '3': ListDefinition.of('check'),
          '4': ListDefinition.of('number'),
          '5': ListPresets.byId('checklist-plain')!.list,
        },
      },
    );
  },
  sections: (format) => {
    const portrait = PageSetup.of('a4', format);
    const landscape = {
      ...PageSetup.of('a4', format),
      width: portrait.height,
      height: portrait.width,
      orientation: 'landscape' as const,
      margins: { top: 36, bottom: 36, left: 54, right: 54 },
    };
    const columns = { ...portrait, columns: { count: 2, gap: 36, separator: true as const } };
    return base(
      format,
      [
        paragraph(format, 'normal', [run('First section, A4 portrait')]),
        { type: 'section', start: 'next-page', setup: landscape },
        paragraph(format, 'normal', [run('Second section, landscape')]),
        { type: 'section', start: 'next-page', setup: portrait },
        paragraph(format, 'normal', [run('Third section')]),
        { type: 'section', start: 'continuous', setup: columns },
        paragraph(format, 'normal', [run('Two columns')]),
        paragraph(format, 'normal', [run('Second column')], { props: { columnBreakBefore: true } }),
        { type: 'section', start: 'continuous', setup: portrait },
        paragraph(format, 'normal', [run('One column again')]),
      ],
      {
        section: { start: 'next-page', setup: { ...portrait, pageColor: '#fff2cc' } },
        pageless: true,
      },
    );
  },
  headers: (format) => {
    const setup = PageSetup.of('a4', format);
    const story = (text: string) => ({ blocks: [paragraph(format, 'normal', [run(text)])] });
    return base(
      format,
      [
        paragraph(format, 'normal', [run('First section')]),
        {
          type: 'section',
          start: 'next-page',
          setup,
          headers: { header: { default: story('Second section header') }, differentOddEven: true },
        },
        paragraph(format, 'normal', [run('Second section')]),
      ],
      {
        section: {
          start: 'next-page',
          setup: { ...setup, margins: { ...setup.margins, header: 24, footer: 30 } },
          headers: {
            header: {
              default: story('Header'),
              first: story('First page header'),
              even: story('Even page header'),
            },
            footer: {
              default: { blocks: [paragraph(format, 'normal', [run('Footer', { bold: true })])] },
            },
            differentFirst: true,
            differentOddEven: true,
          },
        },
      },
    );
  },
  fields: (format) => {
    const setup = PageSetup.of('a4', format);
    return base(
      format,
      [
        paragraph(format, 'normal', [
          run('Pages: '),
          { type: 'field', field: 'page-count', text: '2', props: { italic: true } },
        ]),
        { type: 'section', start: 'next-page', setup, numberStart: 2 },
        paragraph(format, 'normal', [run('Starts at two')]),
      ],
      {
        section: {
          start: 'next-page',
          setup,
          numberStart: 1,
          headers: {
            footer: {
              default: {
                blocks: [
                  paragraph(
                    format,
                    'normal',
                    [
                      run('Page '),
                      { type: 'field', field: 'page-number', text: '1', props: { bold: true } },
                      run(' of '),
                      { type: 'field', field: 'page-count', text: '2', props: {} },
                    ],
                    { props: { align: 'end' } },
                  ),
                ],
              },
            },
          },
        },
      },
    );
  },
  // A text watermark (page-layout.md "Watermark"): bold, horizontal, its own colour, in a document whose second section
  // shows a first page header of its own.
  watermark: (format) => {
    const setup = PageSetup.of('a4', format);
    return base(
      format,
      [
        paragraph(format, 'normal', [run('Behind this writing')]),
        {
          type: 'section',
          start: 'next-page',
          setup,
          headers: {
            header: {
              first: { blocks: [paragraph(format, 'normal', [run('Its own first page')])] },
            },
            differentFirst: true,
          },
        },
        paragraph(format, 'normal', [run('A second section')]),
      ],
      {
        watermark: {
          kind: 'text',
          text: 'CONFIDENTIAL',
          font: 'Georgia',
          size: 54,
          bold: true,
          colour: '#6aa84f',
          transparency: 0.3,
          layout: 'horizontal',
        },
      },
    );
  },
  // Line numbers (page-layout.md "Line numbers"): restarting on each page, a section without, one restarting on its own.
  lineNumbers: (format) => {
    const setup = PageSetup.of('a4', format);
    return base(
      format,
      [
        paragraph(format, 'normal', [run('Numbered, restarting on each page')]),
        paragraph(format, 'normal', [run('A second numbered line')]),
        { type: 'section', start: 'next-page', setup },
        paragraph(format, 'normal', [run('Not numbered')]),
        {
          type: 'section',
          start: 'next-page',
          setup,
          lineNumbers: { restart: 'section' },
        },
        paragraph(format, 'normal', [run('Numbered from 1 again')]),
      ],
      { section: { start: 'next-page', setup, lineNumbers: { restart: 'page' } } },
    );
  },
  footnotes: (format) =>
    base(format, [
      paragraph(format, 'normal', [
        run('A claim'),
        { type: 'note', blocks: [paragraph(format, 'normal', [run('The source.')])], props: {} },
        run(' and another', { italic: true }),
        {
          type: 'note',
          blocks: [
            paragraph(format, 'normal', [
              run('Bold', { bold: true }),
              run(', and a '),
              run('link', {}, { link: 'https://example.com/note' }),
            ]),
            paragraph(format, 'normal', [run('A second paragraph.')]),
          ],
          props: { italic: true },
        },
        run('.'),
      ]),
    ]),
  // tables.md "The model": a header row, a cell across two columns and one down two rows, shading, lines, padding,
  // vertical alignment, a row of exact height that may not break, a nested table and a note in a cell.
  tables: (format) => {
    const p = (text: string, props = {}) => paragraph(format, 'normal', [run(text, props)]);
    const cell = (blocks: Block[], extra: Partial<TableCell> = {}): TableCell => ({
      blocks,
      props: {},
      ...extra,
    });
    const line = (width: number, color = '#000000', dash: BorderDash = 'solid'): BorderLine => ({
      width,
      dash,
      color,
      space: 0,
    });
    const nested: Table = {
      type: 'table',
      columns: [54, 54],
      headerRows: 0,
      rows: [
        { cells: [cell([p('n1')]), cell([p('n2')])] },
        { cells: [cell([p('n3')]), cell([p('n4')])] },
      ],
    };
    return base(format, [
      p('Before the table'),
      {
        type: 'table',
        columns: [144, 108, 216],
        headerRows: 1,
        align: 'center',
        indent: 18,
        rows: [
          { cells: [cell([p('Name', { bold: true })]), cell([p('Kind')]), cell([p('Notes')])] },
          {
            height: 24,
            cells: [
              cell([p('Across two')], { colSpan: 2, props: { background: '#d9ead3' } }),
              cell([p('Down two')], { rowSpan: 2, props: { verticalAlign: 'middle' } }),
            ],
          },
          {
            height: 36,
            heightRule: 'exact',
            breaks: false,
            cells: [
              cell([p('Lined')], {
                props: {
                  borders: {
                    top: line(1),
                    bottom: line(1),
                    left: line(0.5, '#cc0000', 'dashed'),
                    right: line(2, '#1155cc', 'dotted'),
                  },
                  padding: { top: 2, bottom: 2, left: 5, right: 5 },
                  verticalAlign: 'bottom',
                },
              }),
              cell([
                paragraph(format, 'normal', [
                  run('Nested, with a note'),
                  { type: 'note', blocks: [p('In a cell.')], props: {} },
                ]),
                nested,
                paragraph(format, 'normal', []),
              ]),
            ],
          },
        ],
      },
      p('After the table'),
    ]);
  },
  links: (format) =>
    base(format, [
      paragraph(format, 'normal', [
        run('A '),
        run('link', {}, { link: 'https://example.com/?a=1&b=2' }),
        run(', '),
        run('bold link', { bold: true }, { link: 'https://example.com/?a=1&b=2' }),
        run(', mail', {}, { link: 'mailto:a@example.com' }),
        run(' and a place', {}, { link: '#heading' }),
      ]),
    ]),
  metadata: (format) => ({
    ...TextDocument.blank({ format }),
    metadata: {
      title: 'Metadata',
      subject: 'Subject',
      description: 'About it',
      author: 'Ada',
      lastModifiedBy: 'Grace',
      created: '2026-11-18T10:00:00Z',
      modified: '2026-11-18T11:00:00Z',
      language: 'en-GB',
    },
  }),
  // objects.md "The model": pictures in line, one cropped with alternative text and a title, one decorative sharing its
  // media and turned, one linked and recoloured in two colours and adjusted, one greyscale in a table cell and one in a
  // header; the linked one and the header's are drawings' pictures, naming their drawing tabs (objects.md "In the
  // file").
  pictures: (format) => {
    const picture = (
      media: string,
      width: number,
      height: number,
      extra: Partial<Picture> = {},
    ): Picture => ({
      type: 'picture',
      media,
      width,
      height,
      props: {},
      ...extra,
    });
    const cropped = picture(GREEN_PNG_SHA, 60, 40, {
      alt: 'A green field',
      title: 'Field',
      crop: { top: 0.2, right: 0.05, bottom: 0, left: 0.1 },
    });
    const media = {
      [GREEN_PNG_SHA]: { mediaType: 'image/png' as const, bytes: GREEN_PNG },
      [BLUE_PNG_SHA]: { mediaType: 'image/png' as const, bytes: BLUE_PNG },
    };
    const p = (inlines: Paragraph['inlines']) => paragraph(format, 'normal', inlines);
    return base(
      format,
      [
        p([
          run('Before '),
          cropped,
          run(' between '),
          picture(GREEN_PNG_SHA, 24, 17, { decorative: true, rotation: 330.5 }),
          run('.'),
        ]),
        p([
          picture(BLUE_PNG_SHA, 30, 30, {
            link: 'https://docs.nu/',
            alt: 'Blue',
            drawing: 'drawing-1',
            recolour: { kind: 'duotone', dark: '#1a2b3c', light: '#4285f4' },
            transparency: 40,
            brightness: 20.5,
            contrast: -30,
          }),
        ]),
        {
          type: 'table',
          columns: [200],
          headerRows: 0,
          rows: [
            {
              cells: [
                {
                  blocks: [p([picture(BLUE_PNG_SHA, 12, 12, { recolour: { kind: 'greyscale' } })])],
                  props: {},
                },
              ],
            },
          ],
        },
        p([run('After.')]),
      ],
      {
        media,
        section: {
          ...TextDocument.blank({ format }).section,
          headers: {
            header: {
              default: {
                blocks: [
                  p([run('Logo '), picture(BLUE_PNG_SHA, 18, 18, { drawing: 'drawing-2' })]),
                ],
              },
            },
          },
        },
      },
    );
  },
  // objects.md "The model", Placement: one picture wrapped, moving with its text, with LibreOffice's margins; one
  // behind the text, fixed on the page.
  placedPictures: (format) => {
    const placed = (
      media: string,
      size: number,
      placement: Picture['placement'],
      alt?: string,
    ): Picture => ({
      type: 'picture',
      media,
      width: size,
      height: size,
      props: {},
      placement,
      ...(alt ? { alt } : {}),
    });
    return base(
      format,
      [
        paragraph(format, 'normal', [
          run('Placed '),
          placed(
            GREEN_PNG_SHA,
            40,
            {
              wrap: 'wrap',
              margin: { top: 3.6, right: 7.2, bottom: 3.6, left: 7.2 },
              moves: 'with-text',
              x: 72,
              y: 36,
            },
            'Wrapped',
          ),
          run(' and '),
          placed(BLUE_PNG_SHA, 20, {
            wrap: 'behind',
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            moves: 'page',
            x: 100,
            y: 200,
          }),
          run('.'),
        ]),
      ],
      {
        media: {
          [GREEN_PNG_SHA]: { mediaType: 'image/png' as const, bytes: GREEN_PNG },
          [BLUE_PNG_SHA]: { mediaType: 'image/png' as const, bytes: BLUE_PNG },
        },
      },
    );
  },
  // links-and-navigation.md "Bookmarks": a bookmark at a paragraph's start and one mid-text, a link to it, and one in
  // a bold run.
  bookmarks: (format) =>
    base(format, [
      paragraph(format, 'normal', [
        { type: 'bookmark', name: 'a1b2c3d4e5f6', props: {} },
        run('Start here, '),
        { type: 'bookmark', name: 'mid', props: {} },
        run('then on.', { bold: true }),
      ]),
      paragraph(format, 'normal', [
        run('Back to the '),
        run('start', {}, { link: '#a1b2c3d4e5f6' }),
      ]),
    ]),
  // review.md "How a comment is kept": a resolved thread with a reply on a stretch across a format change, a point
  // comment, and an open thread across two paragraphs, its text two lines.
  comments: (format) => {
    // Ids as each format's reader makes them, so the file reads back equal: ODF by annotation name, a reply by its
    // place; Word by each comment's number. A LiveDoc person's key never travels (comments-files.test.ts).
    const odf = format === 'odf';
    const ids = {
      t1: odf ? 'f.t1' : 'f.0',
      r1: odf ? 'f.t1.1' : 'f.1',
      t2: odf ? 'f.t2' : 'f.2',
      t3: odf ? 'f.t3' : 'f.3',
    };
    const mark = (edge: 'start' | 'end', id: string) => ({
      type: 'comment' as const,
      edge,
      id,
      props: {},
    });
    const author = { name: 'Ada Lovelace', initials: 'AL' };
    return base(
      format,
      [
        paragraph(format, 'normal', [
          run('The '),
          mark('start', ids.t1),
          run('quarterly '),
          run('results', { bold: true }),
          mark('end', ids.t1),
          run(' are in'),
          mark('start', ids.t2),
          mark('end', ids.t2),
          run('.'),
        ]),
        paragraph(format, 'normal', [mark('start', ids.t3), run('Next steps')]),
        paragraph(format, 'normal', [run('follow.'), mark('end', ids.t3)]),
      ],
      {
        comments: [
          {
            id: ids.t1,
            resolved: true,
            comments: [
              {
                id: ids.t1,
                text: 'Is this final?',
                at: Date.UTC(2026, 10, 18, 10),
                author,
                reactions: { '👍': ['a1', 'b2'] },
                mentions: [{ name: 'Priya Kaur', handle: 'priya-kaur' }],
                assignee: { name: 'Priya Kaur', handle: 'priya-kaur' },
              },
              {
                id: ids.r1,
                text: 'Yes & <done>.',
                at: Date.UTC(2026, 10, 18, 11),
                author: { name: 'Bo' },
              },
            ],
          },
          {
            id: ids.t2,
            resolved: false,
            comments: [{ id: ids.t2, text: 'A point.', author: { name: 'Cy' } }],
          },
          {
            id: ids.t3,
            resolved: false,
            comments: [{ id: ids.t3, text: 'Two\nlines', at: Date.UTC(2026, 10, 19), author }],
          },
        ],
      },
    );
  },
  // review.md "How a suggestion is kept": an insertion, a deletion and a format change in one paragraph, a paragraph break
  // before the second, and a paragraph format on the third. Word's ids; ODF carries any id as `livedoc:suggestion`.
  suggestions: (format) => {
    const at = Date.UTC(2026, 10, 20, 9, 30);
    const author = { name: 'Ada Lovelace' };
    const mark = (n: number) => ({ id: `f.${n}`, at, author });
    return base(format, [
      paragraph(format, 'normal', [
        run('The '),
        { ...run('quick '), suggested: { insertion: mark(1) } },
        { ...run('slow '), suggested: { deletion: mark(2) } },
        {
          ...run('fox', { bold: true }),
          suggested: { format: { ...mark(3), before: { props: {} } } },
        },
      ]),
      { ...paragraph(format, 'normal', [run('jumps')]), suggested: { break: mark(4) } },
      {
        ...paragraph(format, 'heading1', [run('Over')]),
        suggested: {
          format: {
            ...mark(5),
            before: { style: Styles.idOfRole(Styles.builtIn(format), 'normal')!, props: {} },
          },
        },
      },
    ]);
  },
  // standard-mapping.md "Suggested blocks": a table of contents suggested deleted, a table suggested inserted with an
  // empty cell and another person's insertion inside, and a section break suggested inserted.
  suggestedBlocks: (format) => {
    const at = Date.UTC(2026, 10, 26, 10);
    const mark = (id: string, name: string) => ({ id, at, author: { name } });
    const p = (inlines: Paragraph['inlines']) => paragraph(format, 'normal', inlines);
    const cell = (blocks: Block[]): TableCell => ({ blocks, props: {} });
    return base(format, [
      {
        type: 'contents',
        look: 'links',
        levels: 1,
        entries: [p([run('Alpha', {}, { link: '#_alpha0000001' })])],
        suggested: { deletion: mark('sContents', 'Bo') },
      },
      paragraph(format, 'heading1', [
        { type: 'bookmark', name: '_alpha0000001', props: {} },
        run('Alpha'),
      ]),
      {
        type: 'table',
        columns: [144, 144],
        headerRows: 0,
        rows: [
          { cells: [cell([p([run('A1')])]), cell([p([])])] },
          {
            cells: [
              cell([
                p([run('B1 '), { ...run('mine'), suggested: { insertion: mark('sBo', 'Bo') } }]),
              ]),
              cell([p([run('B2')])]),
            ],
          },
        ],
        suggested: { insertion: mark('sTable', 'Ada Lovelace') },
      },
      p([run('Between')]),
      {
        type: 'section',
        start: 'next-page',
        setup: PageSetup.of('a4', format),
        suggested: { insertion: mark('sSection', 'Ada Lovelace') },
      },
      p([run('After')]),
    ]);
  },
  // standard-mapping.md "Suggested blocks": a row inserted with another author's text inside and an empty cell, a row
  // deleted, a column inserted with an empty cell, a column deleted.
  suggestedRows: (format) => {
    const at = Date.UTC(2026, 10, 26, 10);
    const mark = (id: string, name: string) => ({ id, at, author: { name } });
    const p = (inlines: Paragraph['inlines']) => paragraph(format, 'normal', inlines);
    const cell = (text: string, suggested?: TableCell['suggested']): TableCell => ({
      blocks: [p(text ? [run(text)] : [])],
      props: {},
      ...(suggested ? { suggested } : {}),
    });
    const table = (rows: Table['rows']): Table => ({
      type: 'table',
      columns: [144, 144],
      headerRows: 0,
      rows,
    });
    const addedColumn = { insertion: mark('sColumn', 'Ada Lovelace') };
    const goneColumn = { deletion: mark('sColumnGone', 'Bo') };
    return base(format, [
      table([
        { cells: [cell('A1'), cell('B1')] },
        {
          cells: [
            {
              blocks: [
                p([run('A2 '), { ...run('mine'), suggested: { insertion: mark('sBo', 'Bo') } }]),
              ],
              props: {},
            },
            cell(''),
          ],
          suggested: { insertion: mark('sRow', 'Ada Lovelace') },
        },
        { cells: [cell('A3'), cell('B3')], suggested: { deletion: mark('sRowGone', 'Bo') } },
      ]),
      p([run('Between')]),
      table([
        { cells: [cell('C1'), cell('D1', addedColumn)] },
        { cells: [cell('C2'), cell('', addedColumn)] },
      ]),
      p([run('And')]),
      table([
        { cells: [cell('E1'), cell('F1', goneColumn)] },
        { cells: [cell('E2'), cell('F2', goneColumn)] },
      ]),
      p([run('After')]),
    ]);
  },
  // links-and-navigation.md "Table of contents": a Dotted one of two levels, each entry its heading's text and page
  // number linked to the heading's id, then the headings it lists.
  contents: (format) => {
    const DOTTED_STOP = { position: 468, align: 'end', leader: 'dot' } as const;
    const linked = (text: string, id: string) => run(text, {}, { link: `#${id}` });
    const heading = (role: 'heading1' | 'heading2', id: string, text: string) =>
      paragraph(format, role, [{ type: 'bookmark', name: id, props: {} }, run(text)]);
    return base(format, [
      {
        type: 'contents',
        look: 'dotted',
        levels: 2,
        entries: [
          paragraph(format, 'normal', [linked('Alpha\t1', '_alpha0000001')], {
            props: { tabStops: [DOTTED_STOP] },
          }),
          paragraph(format, 'normal', [linked('Beta\t2', '_beta00000001')], {
            props: { tabStops: [DOTTED_STOP] },
          }),
        ],
      },
      heading('heading1', '_alpha0000001', 'Alpha'),
      heading('heading2', '_beta00000001', 'Beta'),
    ]);
  },
  // objects.md "The equation model": an equation in line among text, in its run's size and colour, holding every kind
  // of node; a paragraph of one equation on its own line, centred.
  equations: (format) => {
    const id = (text: string): MathNode => ({ kind: 'identifier', text });
    const num = (text: string): MathNode => ({ kind: 'number', text });
    const op = (text: string): MathNode => ({ kind: 'operator', text });
    const every: MathRow = [
      { kind: 'fraction', numerator: [id('a')], denominator: [id('b'), op('+'), num('1')] },
      op('+'),
      { kind: 'scripts', base: [id('x')], sub: [num('1')], sup: [num('2')] },
      { kind: 'root', radicand: [id('z')], index: [num('3')] },
      { kind: 'root', radicand: [id('y')] },
      op('≤'),
      {
        kind: 'large-operator',
        operator: '∑',
        lower: [id('k'), op('='), num('1')],
        upper: [id('n')],
        body: [id('k')],
      },
      { kind: 'large-operator', operator: '∫', lower: [num('0')], upper: [], body: [id('f')] },
      { kind: 'fence', open: '(', close: ']', body: [id('p')] },
      { kind: 'accent', base: [id('v')], accent: '→' },
      { kind: 'under-over', base: [id('lim')], under: [id('a'), op('→'), id('b')] },
      { kind: 'text', text: 'if x' },
    ];
    const equation = (math: MathRow, props = {}): Equation => ({ type: 'equation', math, props });
    return base(format, [
      paragraph(format, 'normal', [
        run('Where '),
        equation(every, { size: 14, color: '#1155cc' }),
        run(' holds.'),
      ]),
      paragraph(
        format,
        'normal',
        [
          equation([
            id('E'),
            op('='),
            id('m'),
            { kind: 'scripts', base: [id('c')], sup: [num('2')] },
          ]),
        ],
        {
          props: { align: 'center' },
        },
      ),
    ]);
  },
  // text-document.md "Tabs inside one text document": three document tabs, the second with an emoji and a subtab,
  // its writing ending in landscape, so the third starts back in the first section's setup.
  tabs: (format) => {
    const portrait = PageSetup.of('a4', format);
    const landscape = PageSetup.oriented(portrait, 'landscape');
    return base(format, [paragraph(format, 'heading1', [run('Overview')])], {
      section: { start: 'next-page', setup: portrait },
      tabs: {
        first: { id: 't.0', name: 'Overview' },
        more: [
          {
            id: 't.k3x9q2m7p1zz',
            name: 'Details',
            emoji: '📌',
            depth: 0,
            body: [
              paragraph(format, 'normal', [run('Details, portrait')]),
              { type: 'section', start: 'next-page', setup: landscape },
              paragraph(format, 'normal', [run('Details, landscape')]),
            ],
          },
          {
            id: 't.a1b2c3d4e5f6',
            name: 'Details',
            depth: 1,
            body: [paragraph(format, 'normal', [run('A subtab of the same name')])],
          },
        ],
      },
    });
  },
};
