// Download as Rich Text (docs/specs/034-text-documents/files-and-print.md "Downloading"): RTF that Word and LibreOffice
// open as drawn. Each paragraph's formatting is written whole, its style's and its own, so a reader that keeps no
// styles shows the same; headings keep their outline level; list items carry their marker as drawn; tables keep their
// widths, header rows and merged cells; PNG and JPEG pictures their size and crop; footnotes are the format's own.
import type { Block, Inline, Paragraph } from '../model/blocks';
import { Equations } from '../model/equations';
import type { Picture } from '../model/pictures';
import { Pictures } from '../model/pictures';
import type { ParagraphProps, TextProps } from '../model/props';
import { Styles, type StyleRole } from '../model/styles';
import { Blocks, Tables, type Table } from '../model/tables';
import type { TextDocument } from '../model/text-document';
import { isSafeLink } from '../report';
import { exportContext, exportTabs, tabsTitled, type ExportContext } from './export-walk';
import { pictureText } from './plain-text';
import { rtfTables, rtfText, type RtfTables } from './rtf-tables';

/** Points to twips. */
const tw = (pt: number) => Math.round(pt * 20);
/** A list level's indent, in twips (default: half an inch a level, the marker hanging). */
const LIST_INDENT_TW = 360;
/** How many hex digits a line of picture bytes holds. */
const HEX_LINE = 128;

/** The built-in styles' numbers and the names Word knows them by. */
const STYLES: readonly { role: StyleRole; name: string }[] = [
  { role: 'normal', name: 'Normal' },
  { role: 'heading1', name: 'heading 1' },
  { role: 'heading2', name: 'heading 2' },
  { role: 'heading3', name: 'heading 3' },
  { role: 'heading4', name: 'heading 4' },
  { role: 'heading5', name: 'heading 5' },
  { role: 'heading6', name: 'heading 6' },
  { role: 'title', name: 'Title' },
  { role: 'subtitle', name: 'Subtitle' },
];

const ALIGN = { start: '\\ql', center: '\\qc', end: '\\qr', justify: '\\qj' } as const;
const finite = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n);

/** A target inside a field's instruction: quotes and backslashes escaped. */
const fieldTarget = (target: string) => rtfText(target.replace(/["\\]/g, (c) => `\\${c}`));

function paragraphControls(props: ParagraphProps): string {
  let out = props.align ? (ALIGN[props.align] ?? '') : '';
  if (finite(props.indentStart)) out += `\\li${tw(props.indentStart)}`;
  if (finite(props.indentEnd)) out += `\\ri${tw(props.indentEnd)}`;
  if (finite(props.indentFirst)) out += `\\fi${tw(props.indentFirst)}`;
  if (finite(props.spaceBefore)) out += `\\sb${tw(props.spaceBefore)}`;
  if (finite(props.spaceAfter)) out += `\\sa${tw(props.spaceAfter)}`;
  const line = props.lineHeight;
  if (line?.rule === 'multiple' && finite(line.value))
    out += `\\sl${Math.round(240 * line.value)}\\slmult1`;
  else if (line?.rule === 'exact' && finite(line.pt)) out += `\\sl-${tw(line.pt)}\\slmult0`;
  else if (line?.rule === 'atLeast' && finite(line.pt)) out += `\\sl${tw(line.pt)}\\slmult0`;
  if (props.pageBreakBefore === true) out += '\\pagebb';
  return out;
}

function textControls(props: TextProps, tables: RtfTables): string {
  let out = '';
  if (props.font) out += `\\f${tables.font(props.font)}`;
  if (finite(props.size)) out += `\\fs${Math.round(props.size * 2)}`;
  if (props.bold === true) out += '\\b';
  if (props.italic === true) out += '\\i';
  if (props.underline === true) out += '\\ul';
  if (props.strike === true) out += '\\strike';
  if (props.vertical === 'super') out += '\\super';
  if (props.vertical === 'sub') out += '\\sub';
  const colour = tables.colour(props.color);
  if (colour !== undefined) out += `\\cf${colour}`;
  const highlight = tables.colour(props.highlight);
  if (highlight !== undefined) out += `\\highlight${highlight}`;
  if (props.smallCaps === true) out += '\\scaps';
  if (props.transform === 'uppercase') out += '\\caps';
  return out;
}

const hex = (bytes: Uint8Array) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, '0');
    if ((i + 1) % (HEX_LINE / 2) === 0) out += '\n';
  }
  return out;
};

type RtfWriter = { readonly blocks: (blocks: readonly Block[], inCell: boolean) => string };

function rtfWriter(document: TextDocument, tables: RtfTables): RtfWriter {
  const context: ExportContext = exportContext(document);
  const bookmarks = new Set<string>();
  for (const tab of exportTabs(document))
    for (const paragraph of Blocks.paragraphs(tab.body))
      for (const inline of paragraph.inlines)
        if (inline.type === 'bookmark') bookmarks.add(inline.name);

  const runProps = (paragraph: Paragraph, inline: Inline): TextProps => ({
    ...Styles.textPropsOf(
      document.styles,
      document.defaults,
      paragraph.style,
      'style' in inline ? inline.style : undefined,
    ),
    ...paragraph.text,
    ...inline.props,
  });

  const pictureRtf = (picture: Picture): string => {
    const held = Pictures.heldBytes(document, picture.media);
    const blip =
      held?.mediaType === 'image/png'
        ? '\\pngblip'
        : held?.mediaType === 'image/jpeg'
          ? '\\jpegblip'
          : null;
    if (!held || !blip)
      return picture.decorative ? '' : rtfText(pictureText(picture.alt, picture.title));
    const crop = picture.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const width = picture.width / Math.max(0.01, 1 - crop.left - crop.right);
    const height = picture.height / Math.max(0.01, 1 - crop.top - crop.bottom);
    const crops = (['top', 'bottom', 'left', 'right'] as const)
      .filter((side) => crop[side] > 0)
      .map(
        (side) =>
          `\\piccrop${side[0]}${tw(crop[side] * (side === 'top' || side === 'bottom' ? height : width))}`,
      )
      .join('');
    const px = (pt: number) => Math.max(1, Math.round((pt * 4) / 3));
    return `{\\pict${blip}\\picw${px(width)}\\pich${px(height)}\\picwgoal${tw(width)}\\pichgoal${tw(height)}${crops}\n${hex(held.bytes)}}`;
  };

  const inlineRtf = (inline: Inline): string => {
    switch (inline.type) {
      case 'run':
      case 'field':
        return rtfText(inline.text);
      case 'picture':
        return pictureRtf(inline);
      case 'equation':
        return rtfText(Equations.linear(inline.math));
      case 'note':
        return `{\\super\\chftn}{\\footnote\\pard\\plain{\\super\\chftn}${blocksRtf(inline.blocks, false).replace(/\\par\n?$/, '')}}`;
      case 'bookmark':
        return `{\\*\\bkmkstart ${rtfText(inline.name)}}{\\*\\bkmkend ${rtfText(inline.name)}}`;
      default:
        return '';
    }
  };

  const linkOf = (inline: Inline): string | null => {
    const link = 'link' in inline ? inline.link : undefined;
    if (!link || !isSafeLink(link)) return null;
    if (!link.startsWith('#')) return `HYPERLINK "${fieldTarget(link.trim())}"`;
    return bookmarks.has(link.slice(1)) ? `HYPERLINK \\\\l "${fieldTarget(link.slice(1))}"` : null;
  };

  /** A paragraph's runs, those of the same formatting and link gathered in one group. */
  const runsRtf = (paragraph: Paragraph): string => {
    const pieces: { controls: string; link: string | null; text: string }[] = [];
    for (const inline of paragraph.inlines) {
      const text = inlineRtf(inline);
      if (!text) continue;
      const controls = textControls(runProps(paragraph, inline), tables);
      const link = linkOf(inline);
      const last = pieces.at(-1);
      if (last && last.controls === controls && last.link === link) last.text += text;
      else pieces.push({ controls, link, text });
    }
    return pieces
      .map(({ controls, link, text }) => {
        const group = `{${controls}${controls ? ' ' : ''}${text}}`;
        return link ? `{\\field{\\*\\fldinst{${link}}}{\\fldrslt ${group}}}` : group;
      })
      .join('');
  };

  const styleNumber = (paragraph: Paragraph) => {
    const style = Styles.byId(document.styles, paragraph.style);
    const at = STYLES.findIndex((s) => s.role === style?.role);
    return at >= 0 ? `\\s${at}` : '';
  };

  const paragraphRtf = (paragraph: Paragraph, inCell: boolean): string => {
    const props: ParagraphProps = {
      ...Styles.paragraphPropsOf(document.styles, document.defaults, paragraph.style),
      ...paragraph.props,
    };
    const marker = context.markers.get(paragraph);
    let lead = '';
    let indents = '';
    if (marker) {
      const first = paragraph.inlines[0];
      const controls = textControls(
        first
          ? runProps(paragraph, first)
          : runProps(paragraph, { type: 'run', text: '', props: {} }),
        tables,
      );
      const drawn = marker.kind === 'check' ? (marker.checked ? '☑' : '☐') : marker.text;
      lead = `{${controls}${controls ? ' ' : ''}${rtfText(drawn)}\\tab}`;
      if (paragraph.props.indentStart === undefined)
        indents = `\\li${LIST_INDENT_TW * (marker.level + 1)}\\fi-${LIST_INDENT_TW}`;
    }
    const level = props.outlineLevel;
    const outline = finite(level) && level >= 1 ? `\\outlinelevel${Math.min(level, 9) - 1}` : '';
    return `\\pard\\plain${inCell ? '\\intbl' : ''}${styleNumber(paragraph)}${paragraphControls(props)}${indents}${outline}\n${lead}${runsRtf(paragraph)}`;
  };

  const tableRtf = (table: Table): string => {
    const grid = Tables.grid(table);
    const edges: number[] = [];
    let at = 0;
    for (const width of table.columns) edges.push((at += tw(width)));
    const left = finite(table.indent) ? tw(table.indent) : 0;
    return table.rows
      .map((_, r) => {
        let defs = `\\trowd\\trgaph108\\trleft${left}${r < table.headerRows ? '\\trhdr' : ''}`;
        let cells = '';
        const places = grid[r] ?? [];
        for (let c = 0; c < places.length; c += 1) {
          const place = places[c];
          if (!place) continue;
          const span = place.cell.colSpan ?? 1;
          if (!place.origin && place.row === r) continue;
          const edge = edges[Math.min(place.column + span, edges.length) - 1]! + left;
          if (!place.origin) {
            defs += `\\clvmrg\\cellx${edge}`;
            cells += '\\pard\\plain\\intbl\\cell\n';
            continue;
          }
          const background = tables.colour(place.cell.props.background);
          defs += `${(place.cell.rowSpan ?? 1) > 1 ? '\\clvmgf' : ''}${background === undefined ? '' : `\\clcbpat${background}`}\\cellx${edge}`;
          // A table inside the cell is written as its paragraphs (default).
          const paragraphs = Blocks.paragraphs(place.cell.blocks);
          const body = paragraphs.map((p) => paragraphRtf(p, true)).join('\\par\n');
          cells += `${body || '\\pard\\plain\\intbl'}\\cell\n`;
        }
        return `${defs}\n${cells}\\row\n`;
      })
      .join('');
  };

  const withoutPage = (entry: Paragraph): Paragraph => {
    const last = entry.inlines.at(-1);
    if (last?.type !== 'run') return entry;
    return {
      ...entry,
      inlines: [
        ...entry.inlines.slice(0, -1),
        { ...last, text: last.text.replace(/\t[^\t\n]*$/, '') },
      ],
    };
  };

  function blocksRtf(blocks: readonly Block[], inCell: boolean): string {
    return blocks
      .map((block) => {
        if (block.type === 'paragraph') return `${paragraphRtf(block, inCell)}\\par\n`;
        if (block.type === 'table') return tableRtf(block);
        if (block.type === 'contents')
          return block.entries
            .map((e) => `${paragraphRtf(withoutPage(e), inCell)}\\par\n`)
            .join('');
        return '';
      })
      .join('');
  }

  return { blocks: blocksRtf };
}

/** The document as Rich Text. */
export function writeRtf(document: TextDocument): string {
  const defaultFont = document.defaults.text.font ?? 'Arial';
  const tables = rtfTables(defaultFont);
  const writer = rtfWriter(document, tables);
  const tabs = exportTabs(document);
  const titled = tabsTitled(tabs);
  const heading = Styles.idOfRole(document.styles, 'heading1');
  const body = tabs
    .map((tab) => {
      const title: Paragraph | null =
        titled && heading
          ? {
              type: 'paragraph',
              style: heading,
              props: {},
              inlines: [{ type: 'run', text: tab.name, props: {} }],
            }
          : null;
      return writer.blocks(title ? [title, ...tab.body] : tab.body, false);
    })
    .join('');
  const stylesheet = STYLES.map(({ role, name }, i) => {
    const level = role.startsWith('heading') ? `\\outlinelevel${Number(role.slice(7)) - 1}` : '';
    return Styles.idOfRole(document.styles, role) === undefined && role !== 'normal'
      ? ''
      : `{\\s${i}${level} ${name};}`;
  }).join('');
  const setup = document.section.setup;
  const m = setup.margins;
  const page = `\\paperw${tw(setup.width)}\\paperh${tw(setup.height)}\\margl${tw(m.left)}\\margr${tw(m.right)}\\margt${tw(m.top)}\\margb${tw(m.bottom)}${setup.orientation === 'landscape' ? '\\landscape' : ''}`;
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n${tables.header()}\n{\\stylesheet${stylesheet}}\n${page}\n${body}}\n`;
}
