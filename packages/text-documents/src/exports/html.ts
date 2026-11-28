// A text document's writing as markup, for the Web Page and the EPUB (docs/specs/034-text-documents/files-and-print.md
// "Downloading"): semantic elements, direct formatting on the element, lists nested as drawn, tables with their merged
// cells, pictures as drawn, equations as MathML and footnotes linking both ways. The markup is well-formed XML, so one
// writer serves an HTML page and EPUB's XHTML chapters alike.
import { escapeXmlAttribute as attr, escapeXmlText as text } from '@livedoc/office-packages';
import type { Block, Inline, Paragraph } from '../model/blocks';
import { mathMlXml } from '../model/equation-mathml';
import type { ListMarker } from '../model/list-markers';
import type { NumberFormat } from '../model/lists';
import { PictureColours } from '../model/picture-colours';
import type { Picture } from '../model/pictures';
import type { TableCell, Table } from '../model/tables';
import type { TextDocument } from '../model/text-document';
import { isSafeLink } from '../report';
import {
  codeBlockOf,
  exportContext,
  inlineProps,
  paragraphRole,
  type ExportContext,
} from './export-walk';
import { exportPictures, type ExportPictures } from './html-pictures';
import { paragraphDeclarations, textDeclarations } from './html-style';
import { pictureText } from './plain-text';

/** Where the markup is written: the file holding each bookmark, and the file holding the footnotes ('' is this one). */
export type HtmlPlaces = {
  readonly bookmarkFiles: ReadonlyMap<string, string>;
  readonly notesFile: string;
};

export type HtmlWriter = {
  /** The blocks as markup, written into `file` (the name a link from elsewhere reaches it by; '' for one page). */
  readonly blocks: (blocks: readonly Block[], file: string) => string;
  /** The footnotes as a numbered list, each linking back to its reference; '' when there are none. */
  readonly notes: () => string;
  readonly pictures: ExportPictures;
};

/** Points to CSS pixels, as browsers draw them. */
const px = (pt: number) => Math.max(1, Math.round((pt * 4) / 3));
const HEX = /^#[0-9a-f]{6}$/i;
const OL_TYPES: Readonly<Record<NumberFormat, string>> = {
  decimal: '1',
  'lower-letter': 'a',
  'upper-letter': 'A',
  'lower-roman': 'i',
  'upper-roman': 'I',
};

/** Every bookmark of the blocks, by name, mapped to `file`. */
export function bookmarksIn(blocks: readonly Block[], file: string, into: Map<string, string>) {
  const walk = (inlines: readonly Inline[]) => {
    for (const inline of inlines) {
      if (inline.type === 'bookmark' && !into.has(inline.name)) into.set(inline.name, file);
      if (inline.type === 'note') bookmarksIn(inline.blocks, file, into);
    }
  };
  for (const block of blocks) {
    if (block.type === 'paragraph') walk(block.inlines);
    else if (block.type === 'table')
      for (const row of block.rows)
        for (const cell of row.cells) bookmarksIn(cell.blocks, file, into);
  }
}

const styleAttr = (declarations: readonly string[]) =>
  declarations.length > 0 ? ` style="${attr(declarations.join('; '))}"` : '';

type Marks = {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  readonly vertical: 'super' | 'sub' | null;
  readonly style: string;
  readonly href: string | null;
};
const PLAIN: Marks = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  vertical: null,
  style: '',
  href: null,
};
const sameMarks = (a: Marks, b: Marks) =>
  (Object.keys(a) as (keyof Marks)[]).every((key) => a[key] === b[key]);

/** Markup wrapped in its marks: the link outermost, then bold, italic, underline, strikethrough, raised or lowered. */
function marked(markup: string, marks: Marks): string {
  let out = marks.style ? `<span style="${attr(marks.style)}">${markup}</span>` : markup;
  if (marks.vertical === 'super') out = `<sup>${out}</sup>`;
  if (marks.vertical === 'sub') out = `<sub>${out}</sub>`;
  if (marks.strike) out = `<s>${out}</s>`;
  if (marks.underline) out = `<u>${out}</u>`;
  if (marks.italic) out = `<em>${out}</em>`;
  if (marks.bold) out = `<strong>${out}</strong>`;
  if (marks.href !== null) out = `<a href="${attr(marks.href)}">${out}</a>`;
  return out;
}

/** Text with its tabs kept as drawn and its line breaks as `br`. */
const runMarkup = (value: string) =>
  value
    .split('\n')
    .map((line) =>
      line
        .split('\t')
        .map((piece) => text(piece))
        .join('<span class="tab">\t</span>'),
    )
    .join('<br />');

export function htmlWriter(document: TextDocument, places: HtmlPlaces): HtmlWriter {
  const context: ExportContext = exportContext(document);
  const pictures = exportPictures(document);
  const noteFiles = new Map<number, string>();
  let filters = 0;

  const href = (link: string | undefined, file: string): string | null => {
    if (!link || !isSafeLink(link)) return null;
    if (!link.startsWith('#')) return link.trim();
    const home = places.bookmarkFiles.get(link.slice(1));
    return home === undefined ? null : `${home === file ? '' : home}${link}`;
  };

  const marksOf = (inline: Inline, file: string): Marks => {
    // A note's reference, an equation and a bookmark carry no formatting of their own.
    if (inline.type === 'note' || inline.type === 'equation' || inline.type === 'bookmark')
      return PLAIN;
    const props = inlineProps(context, inline);
    return {
      bold: props.bold === true,
      italic: props.italic === true,
      underline: props.underline === true,
      strike: props.strike === true,
      vertical: props.vertical === 'super' || props.vertical === 'sub' ? props.vertical : null,
      style: textDeclarations(props).join('; '),
      href: 'link' in inline ? href(inline.link, file) : null,
    };
  };

  const pictureMarkup = (picture: Picture): string => {
    const path = pictures.pathOf(picture.media);
    if (!path) return picture.decorative ? '' : text(pictureText(picture.alt, picture.title));
    const width = px(picture.width);
    const height = px(picture.height);
    const alt = picture.decorative ? '' : (picture.alt ?? '').trim();
    const matrix = PictureColours.matrix(picture);
    const opacity = PictureColours.opacity(picture);
    const filter = matrix ? `c${(filters += 1)}` : null;
    const crop = picture.crop;
    const cropped = crop && (crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0);
    const imgStyle: string[] = [];
    if (filter) imgStyle.push(`filter: url(#${filter})`);
    if (opacity < 1) imgStyle.push(`opacity: ${Math.round(opacity * 1000) / 1000}`);
    let img: string;
    if (cropped) {
      // The whole picture drawn at its own scale, shifted so the window shows what the crop leaves.
      const full = {
        width: picture.width / Math.max(0.01, 1 - crop.left - crop.right),
        height: picture.height / Math.max(0.01, 1 - crop.top - crop.bottom),
      };
      imgStyle.unshift(
        `width: ${px(full.width)}px`,
        `height: ${px(full.height)}px`,
        `max-width: none`,
        `margin-left: -${Math.round((crop.left * full.width * 4) / 3)}px`,
        `margin-top: -${Math.round((crop.top * full.height * 4) / 3)}px`,
      );
      img = `<img src="${path}" alt="${attr(alt)}"${styleAttr(imgStyle)} />`;
    } else
      img = `<img src="${path}" alt="${attr(alt)}" width="${width}" height="${height}"${styleAttr(imgStyle)} />`;
    const turn =
      picture.rotation && Number.isFinite(picture.rotation)
        ? [`transform: rotate(${picture.rotation}deg)`]
        : [];
    const drawn = cropped
      ? `<span class="crop"${styleAttr([`width: ${width}px`, `height: ${height}px`, ...turn])}>${img}</span>`
      : turn.length > 0
        ? `<span class="turn"${styleAttr(['display: inline-block', ...turn])}>${img}</span>`
        : img;
    const svg = filter
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position: absolute" aria-hidden="true"><filter id="${filter}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${matrix!.join(' ')}" /></filter></svg>`
      : '';
    return `${svg}${drawn}`;
  };

  const inlineMarkup = (inline: Inline, file: string): string => {
    switch (inline.type) {
      case 'run':
      case 'field':
        return runMarkup(inline.text);
      case 'note': {
        const n = context.notes.get(inline);
        if (n === undefined) return '';
        noteFiles.set(n, file);
        const to = places.notesFile === file ? '' : places.notesFile;
        return `<sup><a href="${to}#fn${n}" id="fnref${n}">${n}</a></sup>`;
      }
      case 'picture':
        return pictureMarkup(inline);
      case 'equation':
        return mathMlXml(inline.math);
      case 'bookmark':
        return `<a id="${attr(inline.name)}"></a>`;
      default:
        return '';
    }
  };

  /** A paragraph's inlines, those of the same marks gathered under one set of tags. */
  const inlinesMarkup = (inlines: readonly Inline[], file: string): string => {
    const pieces: { markup: string; marks: Marks }[] = [];
    for (const inline of inlines) {
      const markup = inlineMarkup(inline, file);
      if (!markup) continue;
      const marks = marksOf(inline, file);
      const last = pieces.at(-1);
      if (last && sameMarks(last.marks, marks)) last.markup += markup;
      else pieces.push({ markup, marks });
    }
    return pieces.map(({ markup, marks }) => marked(markup, marks)).join('');
  };

  const paragraphMarkup = (paragraph: Paragraph, file: string): string => {
    const inner = inlinesMarkup(paragraph.inlines, file) || '<br />';
    const style = styleAttr([
      ...paragraphDeclarations(paragraph.props),
      ...textDeclarations(paragraph.text ?? {}),
    ]);
    const role = paragraphRole(context, paragraph);
    if (role.kind === 'heading') return `<h${role.level}${style}>${inner}</h${role.level}>`;
    const cls = role.kind === 'body' ? '' : ` class="${role.kind}"`;
    return `<p${cls}${style}>${inner}</p>`;
  };

  /** List items as nested lists, by level; another list or kind at a level closes the list and opens the other. */
  const listMarkup = (items: readonly Paragraph[], file: string): string => {
    let out = '';
    const open: { tag: 'ul' | 'ol'; list: string; level: number; next: number }[] = [];
    const close = () => {
      out += `</li></${open.pop()!.tag}>`;
    };
    for (const item of items) {
      const marker = context.markers.get(item) as ListMarker;
      const tag = marker.kind === 'number' ? 'ol' : 'ul';
      while (open.length > 0 && open.at(-1)!.level > marker.level) close();
      const list = item.list?.id ?? '';
      const level = open.at(-1);
      if (level?.level === marker.level && (level.tag !== tag || level.list !== list)) close();
      const top = open.at(-1);
      let value = '';
      if (top?.level === marker.level) {
        out += '</li>';
        if (marker.kind === 'number' && marker.value !== top.next)
          value = ` value="${marker.value}"`;
      } else {
        const opening =
          marker.kind === 'number'
            ? `<ol type="${OL_TYPES[marker.format]}"${marker.value === 1 ? '' : ` start="${marker.value}"`}>`
            : '<ul>';
        out += opening;
        open.push({ tag, list, level: marker.level, next: 0 });
      }
      if (marker.kind === 'number') open.at(-1)!.next = marker.value + 1;
      const check =
        marker.kind === 'check'
          ? `<input type="checkbox" disabled="disabled"${marker.checked ? ' checked="checked"' : ''} /> `
          : '';
      const style = styleAttr(paragraphDeclarations({ align: item.props.align }));
      out += `<li${marker.kind === 'check' ? ' class="check"' : ''}${value}${style}>${check}${inlinesMarkup(item.inlines, file)}`;
    }
    while (open.length > 0) close();
    return out;
  };

  const codeMarkup = (lines: readonly Paragraph[], language: string | null): string => {
    const body = lines
      .map((line) =>
        line.inlines.map((i) => (i.type === 'run' || i.type === 'field' ? i.text : '')).join(''),
      )
      .join('\n');
    const cls = language ? ` class="language-${attr(language)}"` : '';
    return `<pre><code${cls}>${text(body)}</code></pre>`;
  };

  const cellMarkup = (cell: TableCell, tag: 'th' | 'td', file: string): string => {
    const spans =
      ((cell.colSpan ?? 1) > 1 ? ` colspan="${cell.colSpan}"` : '') +
      ((cell.rowSpan ?? 1) > 1 ? ` rowspan="${cell.rowSpan}"` : '');
    const background = cell.props.background;
    const style =
      background && HEX.test(background) ? styleAttr([`background-color: ${background}`]) : '';
    return `<${tag}${spans}${style}>${blocksMarkup(cell.blocks, file)}</${tag}>`;
  };

  const tableMarkup = (table: Table, file: string): string => {
    const cols = table.columns.map((w) => `<col style="width: ${Math.round(w * 100) / 100}pt" />`);
    const rows = (from: number, to: number, tag: 'th' | 'td') =>
      table.rows
        .slice(from, to)
        .map((row) => `<tr>${row.cells.map((cell) => cellMarkup(cell, tag, file)).join('')}</tr>`)
        .join('');
    const head = Math.min(table.headerRows, table.rows.length);
    return `<table><colgroup>${cols.join('')}</colgroup>${head > 0 ? `<thead>${rows(0, head, 'th')}</thead>` : ''}<tbody>${rows(head, table.rows.length, 'td')}</tbody></table>`;
  };

  /** A contents entry without its page number: a file has no pages. */
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

  function blocksMarkup(blocks: readonly Block[], file: string): string {
    const out: string[] = [];
    for (let i = 0; i < blocks.length;) {
      const block = blocks[i]!;
      if (block.type === 'paragraph' && context.markers.has(block)) {
        const items: Paragraph[] = [];
        for (; i < blocks.length; i += 1) {
          const next = blocks[i]!;
          if (next.type !== 'paragraph' || !context.markers.has(next)) break;
          items.push(next);
        }
        out.push(listMarkup(items, file));
        continue;
      }
      const code = block.type === 'paragraph' ? codeBlockOf(context, block) : undefined;
      if (code) {
        const lines: Paragraph[] = [];
        for (; i < blocks.length; i += 1) {
          const next = blocks[i]!;
          if (next.type !== 'paragraph') break;
          const same = codeBlockOf(context, next);
          if (!same || same.language !== code.language) break;
          lines.push(next);
        }
        out.push(codeMarkup(lines, code.language));
        continue;
      }
      i += 1;
      if (block.type === 'paragraph') out.push(paragraphMarkup(block, file));
      else if (block.type === 'table') out.push(tableMarkup(block, file));
      else if (block.type === 'contents')
        out.push(...block.entries.map((entry) => paragraphMarkup(withoutPage(entry), file)));
    }
    return out.join('\n');
  }

  const notes = (): string => {
    if (context.notes.size === 0) return '';
    const items = [...context.notes].map(([note, n]) => {
      const home = noteFiles.get(n) ?? '';
      const back = home === places.notesFile ? '' : home;
      return `<li id="fn${n}">${blocksMarkup(note.blocks, places.notesFile)} <a href="${back}#fnref${n}">↩</a></li>`;
    });
    return `<section class="footnotes"><ol>${items.join('\n')}</ol></section>`;
  };

  return { blocks: blocksMarkup, notes, pictures };
}
