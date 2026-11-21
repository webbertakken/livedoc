// One text document per construct group of the mapping (standard-mapping.md "What the model holds"), in either
// format: what the writers and readers are proven on, and what the validation script writes and checks against each
// format's schema (office-packages.md "Validation"). Test-only; never shipped.
import type { Block, Paragraph } from '../model/blocks';
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
};
