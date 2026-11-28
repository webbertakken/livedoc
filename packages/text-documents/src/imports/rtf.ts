// Rich Text imported (docs/specs/034-text-documents/files-and-print.md "Opening"): paragraphs with their formatting,
// headings by their style or outline level, runs, lists, tables with their merges, PNG and JPEG pictures, footnotes,
// bookmarks and hyperlinks, in a new ODF text document. Headers and footers, embedded objects and pictures of other
// formats are left out and reported; a field other than a link or a page number is its last shown text.
import {
  isPictureTooLarge,
  mediaKeyOf,
  pictureHeader,
  refuse,
  type MappedPictureType,
  type PackageRefusal,
} from '@livedoc/office-packages';
import type { Block, Inline, Note, Paragraph } from '../model/blocks';
import { ListDefinition, type ListLevel, type ListPlace, type NumberFormat } from '../model/lists';
import type { Picture } from '../model/pictures';
import type { ParagraphProps, TextProps } from '../model/props';
import { roleOfStyleName } from '../model/styles';
import type { TextDocument } from '../model/text-document';
import { isSafeLink, type ReportBuilder } from '../report';
import { importStyles } from './import-styles';
import { rtfTable, type RtfCellDef, type RtfRow } from './rtf-table';
import { destinationOf, isGroup, plainTextOf, rtfTree, type RtfGroup } from './rtf-tree';
import type { RtfToken } from './rtf-tokens';

const twips = (n: number) => Math.round((n / 20) * 100) / 100;

const SYMBOLS: Readonly<Record<string, string>> = {
  emdash: '—',
  endash: '–',
  bullet: '•',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  emspace: '\u2003',
  enspace: '\u2002',
  qmspace: '\u2005',
  zwj: '\u200d',
  zwnj: '\u200c',
  ltrmark: '\u200e',
  rtlmark: '\u200f',
};
const CONTROL_SYMBOLS: Readonly<Record<string, string>> = {
  '\\': '\\',
  '{': '{',
  '}': '}',
  '~': '\u00a0',
  _: '\u2011',
  '-': '',
};
/** Destinations read for nothing. */
const SKIPPED = new Set([
  'info',
  'pntext',
  'listtext',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
  'xmlnstbl',
  'rsidtbl',
  'generator',
  'mmathPr',
  'filetbl',
  'revtbl',
  'pgdsctbl',
  'nonshppict',
  'fldinst',
  'listpicture',
  'userprops',
  'docvar',
  'wgrffmtfilter',
  'xe',
  'tc',
]);
const HEADERS_FOOTERS = new Set([
  'header',
  'footer',
  'headerl',
  'headerr',
  'headerf',
  'footerl',
  'footerr',
  'footerf',
]);
/** `\levelnfc` numbers as the model's number formats; anything else, a bullet. */
const LEVEL_FORMATS: Readonly<Record<number, NumberFormat>> = {
  0: 'decimal',
  1: 'upper-roman',
  2: 'lower-roman',
  3: 'upper-letter',
  4: 'lower-letter',
};

/** A list level as `\listlevel` writes it: its number format (none for a bullet) and start. */
type RtfLevel = { format?: NumberFormat; start: number };

/** What a group carries into the groups inside it. */
type Group = {
  text: TextProps;
  link?: string;
  uc: number;
};

/** Where paragraphs being read go: the body, a footnote, a table cell. */
type Sink = {
  blocks: Block[];
  inlines: Inline[];
  props: ParagraphProps;
  style?: string;
  /** An old-style list's place (`\\pn`); else `\\ls` and `\\ilvl` name it. */
  list?: ListPlace;
  ls?: number;
  ilvl: number;
  inTable: boolean;
  /** The table being read: its rows so far, the row's cells, the cell being filled. */
  rows: RtfRow[];
  cells: Block[][];
  cell: Block[];
  defs: RtfCellDef[];
  def: Omit<RtfCellDef, 'edge'>;
  rowLeft: number;
  rowHeader: boolean;
  pageBreak: boolean;
};

const newSink = (): Sink => ({
  blocks: [],
  inlines: [],
  props: {},
  ilvl: 0,
  inTable: false,
  rows: [],
  cells: [],
  cell: [],
  defs: [],
  def: {},
  rowLeft: 0,
  rowHeader: false,
  pageBreak: false,
});

export async function readRtfImport(
  source: string,
  report: ReportBuilder,
): Promise<TextDocument | PackageRefusal> {
  if (!source.startsWith('{\\rtf')) return refuse('package_wrong_type');
  const tree = rtfTree(source);
  if (!tree) return refuse('package_damaged');
  const { blank, styles, normal, heading } = importStyles();
  const fonts: Record<number, string> = {};
  const colours: (string | undefined)[] = [];
  const sheet = new Map<number, { name: string; outline?: number }>();
  const listLevels = new Map<number, RtfLevel[]>();
  const overrides = new Map<number, number>();
  const lists: Record<string, ListDefinition> = {};
  const pending = new Map<string, { bytes: Uint8Array; mediaType: MappedPictureType }>();
  let codePage = 1252;
  let hexBytes: number[] = [];
  let skipChars = 0;

  // --- The tables a file opens with. ---
  const readFonts = (group: RtfGroup) => {
    const read = (g: RtfGroup) => {
      let n: number | undefined;
      let name = '';
      for (const item of g.items) {
        if (isGroup(item)) {
          if (!destinationOf(item)?.ignorable) read(item);
          continue;
        }
        if (item.kind === 'word' && item.name === 'f') n = item.param;
        if (item.kind === 'text') name += item.text;
        if (item.kind === 'hex') name += String.fromCharCode(item.byte);
      }
      const clean = name.replace(/;.*$/s, '').trim();
      if (n !== undefined && clean) fonts[n] = clean;
    };
    read(group);
  };
  const readColours = (group: RtfGroup) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let set = false;
    for (const item of group.items) {
      if (isGroup(item)) continue;
      if (item.kind === 'word' && item.param !== undefined) {
        if (item.name === 'red') [r, set] = [item.param, true];
        if (item.name === 'green') [g, set] = [item.param, true];
        if (item.name === 'blue') [b, set] = [item.param, true];
      }
      if (item.kind === 'text')
        for (const char of item.text)
          if (char === ';') {
            const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
            colours.push(set ? `#${hex(r)}${hex(g)}${hex(b)}` : undefined);
            [r, g, b, set] = [0, 0, 0, false];
          }
    }
  };
  const readStylesheet = (group: RtfGroup) => {
    for (const entry of group.items) {
      if (!isGroup(entry)) continue;
      let s: number | undefined;
      let outline: number | undefined;
      let paragraphStyle = true;
      for (const item of entry.items) {
        if (isGroup(item)) continue;
        if (item.kind === 'word' && item.name === 's') s = item.param ?? 0;
        if (
          item.kind === 'word' &&
          (item.name === 'cs' || item.name === 'ds' || item.name === 'ts')
        )
          paragraphStyle = false;
        if (item.kind === 'word' && item.name === 'outlinelevel') outline = item.param;
      }
      const name = plainTextOf({
        items: entry.items.filter((i) => !isGroup(i)),
      })
        .replace(/;.*$/s, '')
        .trim();
      if (paragraphStyle)
        sheet.set(s ?? 0, { name, ...(outline !== undefined ? { outline } : {}) });
    }
  };
  const readListTable = (group: RtfGroup) => {
    for (const list of group.items) {
      if (!isGroup(list) || destinationOf(list)?.name !== 'list') continue;
      let id: number | undefined;
      const levels: RtfLevel[] = [];
      for (const item of list.items) {
        if (isGroup(item)) {
          if (destinationOf(item)?.name !== 'listlevel') continue;
          let nfc = 23;
          let start = 1;
          for (const word of item.items)
            if (!isGroup(word) && word.kind === 'word') {
              if (word.name === 'levelnfc' || word.name === 'levelnfcn') nfc = word.param ?? 0;
              if (word.name === 'levelstartat') start = word.param ?? 1;
            }
          const format = LEVEL_FORMATS[nfc];
          levels.push(format ? { format, start } : { start });
        } else if (item.kind === 'word' && item.name === 'listid') id = item.param;
      }
      if (id !== undefined) listLevels.set(id, levels);
    }
  };
  const readOverrides = (group: RtfGroup) => {
    for (const entry of group.items) {
      if (!isGroup(entry)) continue;
      let listId: number | undefined;
      let ls: number | undefined;
      for (const item of entry.items)
        if (!isGroup(item) && item.kind === 'word') {
          if (item.name === 'listid') listId = item.param;
          if (item.name === 'ls') ls = item.param;
        }
      if (listId !== undefined && ls !== undefined) overrides.set(ls, listId);
    }
  };

  // --- Text. ---
  const decodeHex = (): string => {
    if (hexBytes.length === 0) return '';
    const bytes = new Uint8Array(hexBytes);
    hexBytes = [];
    try {
      return new TextDecoder(`windows-${codePage}`).decode(bytes);
    } catch {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  };
  const push = (sink: Sink, group: Group, text: string) => {
    if (!text) return;
    sink.inlines.push({
      type: 'run',
      text,
      props: { ...group.text },
      ...(group.link ? { link: group.link } : {}),
    });
  };
  const flushHex = (sink: Sink, group: Group) => push(sink, group, decodeHex());

  const listPlace = (ls: number, level: number): ListPlace => {
    const id = `L${ls}`;
    if (!lists[id]) {
      const read = listLevels.get(overrides.get(ls) ?? ls);
      const levels: ListLevel[] = Array.from({ length: 9 }, (_, at) => {
        const own = read?.[at];
        const kind = own?.format ? 'number' : 'bullet';
        const drawn = ListDefinition.of(kind).levels[at]!;
        return drawn.kind === 'number' && own?.format
          ? { ...drawn, format: own.format, start: own.start }
          : drawn;
      });
      lists[id] = { levels };
    }
    return { id, level: Math.max(0, Math.min(8, level)) };
  };

  const endParagraph = (sink: Sink) => {
    const inlines = sink.inlines;
    sink.inlines = [];
    const outline = sink.props.outlineLevel;
    const { outlineLevel: _, ...props } = sink.props;
    const paragraph: Paragraph = {
      type: 'paragraph',
      style: outline !== undefined ? heading(outline) : (sink.style ?? normal),
      props: { ...props, ...(sink.pageBreak ? { pageBreakBefore: true } : {}) },
      inlines: merged(inlines),
      ...(sink.ls !== undefined
        ? { list: listPlace(sink.ls, sink.ilvl) }
        : sink.list
          ? { list: sink.list }
          : {}),
    };
    sink.pageBreak = false;
    if (sink.inTable) sink.cell.push(paragraph);
    else {
      closeTable(sink);
      sink.blocks.push(paragraph);
    }
  };
  const closeTable = (sink: Sink) => {
    if (sink.rows.length === 0) return;
    sink.blocks.push(
      rtfTable(sink.rows, () => ({ type: 'paragraph', style: normal, props: {}, inlines: [] })),
    );
    sink.rows = [];
  };

  // --- The body. ---
  const word = (sink: Sink, group: Group, item: Extract<RtfToken, { kind: 'word' }>) => {
    const p = item.param;
    const on = p === undefined || p !== 0;
    const t = group.text as Record<string, unknown>;
    switch (item.name) {
      case 'ansicpg':
        codePage = p ?? 1252;
        return;
      case 'uc':
        group.uc = p ?? 1;
        return;
      case 'u': {
        if (p === undefined) return;
        push(sink, group, String.fromCharCode(p < 0 ? p + 65536 : p));
        skipChars = group.uc;
        return;
      }
      case 'par':
        return endParagraph(sink);
      case 'sect':
        return endParagraph(sink);
      case 'page':
        endParagraph(sink);
        sink.pageBreak = true;
        return;
      case 'line':
        return push(sink, group, '\n');
      case 'tab':
        return push(sink, group, '\t');
      case 'pard':
        sink.props = {};
        sink.style = undefined;
        sink.list = undefined;
        sink.ls = undefined;
        sink.ilvl = 0;
        sink.inTable = false;
        return;
      case 'plain':
        group.text = {};
        return;
      case 'intbl':
        sink.inTable = true;
        return;
      case 's': {
        const entry = sheet.get(p ?? 0);
        const role = entry ? roleOfStyleName(entry.name) : undefined;
        if (entry?.outline !== undefined && entry.outline < 6)
          sink.props = { ...sink.props, outlineLevel: entry.outline + 1 };
        else if (role && role.startsWith('heading'))
          sink.props = { ...sink.props, outlineLevel: Number(role.slice(7)) };
        else if (role === 'title' || role === 'subtitle')
          sink.style = styles.find((s) => s.role === role)?.id;
        return;
      }
      case 'outlinelevel':
        if (p !== undefined && p >= 0 && p < 6) sink.props = { ...sink.props, outlineLevel: p + 1 };
        return;
      case 'ql':
        sink.props = { ...sink.props, align: 'start' };
        return;
      case 'qc':
        sink.props = { ...sink.props, align: 'center' };
        return;
      case 'qr':
        sink.props = { ...sink.props, align: 'end' };
        return;
      case 'qj':
        sink.props = { ...sink.props, align: 'justify' };
        return;
      case 'li':
        if (p) sink.props = { ...sink.props, indentStart: twips(p) };
        return;
      case 'ri':
        if (p) sink.props = { ...sink.props, indentEnd: twips(p) };
        return;
      case 'fi':
        if (p) sink.props = { ...sink.props, indentFirst: twips(p) };
        return;
      case 'sb':
        if (p) sink.props = { ...sink.props, spaceBefore: twips(p) };
        return;
      case 'sa':
        if (p) sink.props = { ...sink.props, spaceAfter: twips(p) };
        return;
      case 'sl':
        if (p)
          sink.props = {
            ...sink.props,
            lineHeight:
              p < 0 ? { rule: 'exact', pt: twips(-p) } : { rule: 'atLeast', pt: twips(p) },
          };
        return;
      case 'slmult':
        if (p === 1 && sink.props.lineHeight?.rule === 'atLeast')
          sink.props = {
            ...sink.props,
            lineHeight: {
              rule: 'multiple',
              value: Math.round((sink.props.lineHeight.pt * 20 * 100) / 240) / 100,
            },
          };
        return;
      case 'pagebb':
        sink.pageBreak = true;
        return;
      case 'ls':
        sink.ls = p ?? 0;
        return;
      case 'ilvl':
        sink.ilvl = p ?? 0;
        return;
      case 'b':
        t.bold = on;
        return;
      case 'i':
        t.italic = on;
        return;
      case 'ul':
        t.underline = on;
        return;
      case 'ulnone':
        t.underline = false;
        return;
      case 'strike':
        t.strike = on;
        return;
      case 'scaps':
        t.smallCaps = on;
        return;
      case 'caps':
        if (on) t.transform = 'uppercase';
        else delete t.transform;
        return;
      case 'super':
        t.vertical = 'super';
        return;
      case 'sub':
        t.vertical = 'sub';
        return;
      case 'nosupersub':
        delete t.vertical;
        return;
      case 'fs':
        if (p && p > 0) t.size = p / 2;
        return;
      case 'f':
        if (p !== undefined && fonts[p]) t.font = fonts[p];
        return;
      case 'cf': {
        const colour = p ? colours[p] : undefined;
        if (colour) t.color = colour;
        else delete t.color;
        return;
      }
      case 'highlight':
      case 'cb':
      case 'chcbpat': {
        const colour = p ? colours[p] : undefined;
        if (colour) t.highlight = colour;
        else delete t.highlight;
        return;
      }
      // Table rows.
      case 'trowd':
        sink.defs = [];
        sink.def = {};
        sink.rowLeft = 0;
        sink.rowHeader = false;
        return;
      case 'trleft':
        sink.rowLeft = p ?? 0;
        return;
      case 'trhdr':
        sink.rowHeader = true;
        return;
      case 'clvmgf':
        sink.def = { ...sink.def, vmerge: 'first' };
        return;
      case 'clvmrg':
        sink.def = { ...sink.def, vmerge: 'continue' };
        return;
      case 'clmgf':
        sink.def = { ...sink.def, hmerge: 'first' };
        return;
      case 'clmrg':
        sink.def = { ...sink.def, hmerge: 'continue' };
        return;
      case 'clcbpat': {
        const colour = p ? colours[p] : undefined;
        if (colour) sink.def = { ...sink.def, background: colour };
        return;
      }
      case 'cellx':
        sink.defs.push({ ...sink.def, edge: p ?? 0 });
        sink.def = {};
        return;
      case 'cell':
        if (sink.inlines.length > 0 || sink.cell.length === 0) {
          sink.inTable = true;
          endParagraph(sink);
        }
        sink.cells.push(sink.cell);
        sink.cell = [];
        return;
      case 'row':
        if (sink.inlines.length > 0) endParagraph(sink);
        sink.rows.push({
          left: sink.rowLeft,
          header: sink.rowHeader,
          defs: sink.defs,
          cells: sink.cells,
        });
        sink.cells = [];
        sink.cell = [];
        return;
      case 'chpgn':
        sink.inlines.push({
          type: 'field',
          field: 'page-number',
          text: '1',
          props: { ...group.text },
        });
        return;
      default: {
        const symbol = SYMBOLS[item.name];
        if (symbol) push(sink, group, symbol);
      }
    }
  };

  const fieldOf = (group: RtfGroup, sink: Sink, outer: Group) => {
    const instruction = group.items.find(
      (i): i is RtfGroup => isGroup(i) && destinationOf(i)?.name === 'fldinst',
    );
    const result = group.items.find(
      (i): i is RtfGroup => isGroup(i) && destinationOf(i)?.name === 'fldrslt',
    );
    const text = instruction ? plainTextOf(instruction).trim() : '';
    const link = /^HYPERLINK\s+(\\l\s+)?"((?:[^"\\]|\\.)*)"/i.exec(text);
    const kind = /^(\w+)/.exec(text)?.[1]?.toUpperCase();
    if ((kind === 'PAGE' || kind === 'NUMPAGES') && result) {
      sink.inlines.push({
        type: 'field',
        field: kind === 'PAGE' ? 'page-number' : 'page-count',
        text: plainTextOf(result).trim() || '1',
        props: { ...outer.text },
      });
      return;
    }
    let href: string | undefined;
    if (link) {
      const target = link[2]!.replace(/\\(.)/g, '$1');
      const value = link[1] ? `#${target}` : target;
      if (isSafeLink(value)) href = value;
      else report.drop('link', 'unsafe link');
    }
    if (result)
      body(result, sink, { ...outer, text: { ...outer.text }, ...(href ? { link: href } : {}) });
  };

  const pictureOf = (group: RtfGroup, sink: Sink, outer: Group) => {
    let blip: MappedPictureType | null = null;
    let other = false;
    const size = { w: 0, h: 0, sx: 100, sy: 100, cl: 0, cr: 0, ct: 0, cb: 0 };
    let hex = '';
    let raw: Uint8Array | null = null;
    for (const item of group.items) {
      if (isGroup(item)) continue;
      if (item.kind === 'word') {
        if (item.name === 'pngblip') blip = 'image/png';
        else if (item.name === 'jpegblip') blip = 'image/jpeg';
        else if (/^(wmetafile|emfblip|macpict|pmmetafile|dibitmap|wbitmap)$/.test(item.name))
          other = true;
        const p = item.param ?? 0;
        if (item.name === 'picwgoal') size.w = p;
        if (item.name === 'pichgoal') size.h = p;
        if (item.name === 'picscalex') size.sx = p;
        if (item.name === 'picscaley') size.sy = p;
        if (item.name === 'piccropl') size.cl = p;
        if (item.name === 'piccropr') size.cr = p;
        if (item.name === 'piccropt') size.ct = p;
        if (item.name === 'piccropb') size.cb = p;
      } else if (item.kind === 'text') hex += item.text;
      else if (item.kind === 'bytes') raw = item.bytes;
    }
    if (!blip) {
      report.drop('picture-format', other ? 'metafile picture' : 'picture');
      return;
    }
    const clean = hex.replace(/[^0-9a-f]/gi, '');
    const bytes =
      raw ??
      Uint8Array.from({ length: Math.floor(clean.length / 2) }, (_, i) =>
        parseInt(clean.slice(i * 2, i * 2 + 2), 16),
      );
    const header = pictureHeader(bytes);
    if (!header || header.mediaType !== blip || isPictureTooLarge(bytes)) {
      report.drop('picture-format', 'unreadable picture');
      return;
    }
    const key = `pending:${pending.size}`;
    pending.set(key, { bytes, mediaType: blip });
    const fullW = twips(size.w || header.width * 15) * (size.sx / 100);
    const fullH = twips(size.h || header.height * 15) * (size.sy / 100);
    const crop = {
      left: fullW > 0 ? twips(size.cl) / fullW : 0,
      right: fullW > 0 ? twips(size.cr) / fullW : 0,
      top: fullH > 0 ? twips(size.ct) / fullH : 0,
      bottom: fullH > 0 ? twips(size.cb) / fullH : 0,
    };
    const cropped = crop.left + crop.right + crop.top + crop.bottom > 0;
    const picture: Picture = {
      type: 'picture',
      media: key,
      width: Math.round(fullW * (1 - crop.left - crop.right) * 100) / 100,
      height: Math.round(fullH * (1 - crop.top - crop.bottom) * 100) / 100,
      props: { ...outer.text },
      ...(cropped ? { crop } : {}),
      ...(outer.link ? { link: outer.link } : {}),
    };
    sink.inlines.push(picture);
  };

  const footnoteOf = (group: RtfGroup, sink: Sink, outer: Group) => {
    const inner = newSink();
    body(group, inner, { ...outer, text: {} });
    if (inner.inlines.length > 0) endParagraph(inner);
    closeTable(inner);
    const note: Note = {
      type: 'note',
      blocks:
        inner.blocks.length > 0
          ? inner.blocks
          : [{ type: 'paragraph', style: normal, props: {}, inlines: [] }],
      props: { ...outer.text },
    };
    sink.inlines.push(note);
  };

  function body(group: RtfGroup, sink: Sink, outer: Group) {
    const own: Group = {
      text: { ...outer.text },
      uc: outer.uc,
      ...(outer.link ? { link: outer.link } : {}),
    };
    for (const item of group.items) {
      if (isGroup(item)) {
        flushHex(sink, own);
        const destination = destinationOf(item);
        const name = destination?.name;
        if (name === 'fonttbl') readFonts(item);
        else if (name === 'colortbl') readColours(item);
        else if (name === 'stylesheet') readStylesheet(item);
        else if (name === 'listtable') readListTable(item);
        else if (name === 'listoverridetable') readOverrides(item);
        else if (name === 'field') fieldOf(item, sink, own);
        else if (name === 'pict') pictureOf(item, sink, own);
        else if (name === 'shppict') body(item, sink, own);
        else if (name === 'footnote') footnoteOf(item, sink, own);
        else if (name === 'bkmkstart')
          sink.inlines.push({ type: 'bookmark', name: plainTextOf(item).trim(), props: {} });
        else if (name === 'bkmkend') continue;
        else if (name && HEADERS_FOOTERS.has(name)) report.drop('header-footer', name);
        else if (name === 'object') {
          report.drop('ole-object', 'embedded object');
          const result = item.items.find(
            (i): i is RtfGroup => isGroup(i) && destinationOf(i)?.name === 'result',
          );
          if (result) body(result, sink, own);
        } else if (name === 'pn') {
          const words = item.items.filter(
            (i): i is Extract<RtfToken, { kind: 'word' }> => !isGroup(i) && i.kind === 'word',
          );
          const bulleted = words.some((w) => w.name === 'pnlvlblt');
          const level = words.find((w) => w.name === 'pnlvl')?.param ?? 1;
          const id = bulleted ? 'Lpn1' : 'Lpn2';
          lists[id] ??= ListDefinition.of(bulleted ? 'bullet' : 'number');
          sink.list = { id, level: Math.max(0, Math.min(8, level - 1)) };
        } else if (destination?.ignorable || (name && SKIPPED.has(name))) continue;
        else body(item, sink, own);
        continue;
      }
      if (item.kind === 'hex') {
        if (skipChars > 0) {
          skipChars -= 1;
          continue;
        }
        hexBytes.push(item.byte);
        continue;
      }
      flushHex(sink, own);
      if (item.kind === 'text') {
        let text = item.text;
        if (skipChars > 0) {
          const dropped = Math.min(skipChars, text.length);
          text = text.slice(dropped);
          skipChars -= dropped;
        }
        push(sink, own, text);
      } else if (item.kind === 'symbol') {
        const char = CONTROL_SYMBOLS[item.char];
        if (char !== undefined) push(sink, own, char);
      } else if (item.kind === 'word') {
        word(sink, own, item);
      }
    }
    flushHex(sink, own);
  }

  const root = newSink();
  body(tree, root, { text: {}, uc: 1 });
  if (root.inlines.length > 0) endParagraph(root);
  closeTable(root);

  const keys = new Map<string, string>();
  const media: Record<string, { mediaType: MappedPictureType; bytes: Uint8Array }> = {};
  for (const [pendingKey, picture] of pending) {
    const key = await mediaKeyOf(picture.bytes);
    keys.set(pendingKey, key);
    media[key] = picture;
  }
  const rekey = (blocks: readonly Block[]): Block[] =>
    blocks.map((block): Block => {
      if (block.type === 'table')
        return {
          ...block,
          rows: block.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell, blocks: rekey(cell.blocks) })),
          })),
        };
      if (block.type !== 'paragraph') return block;
      return {
        ...block,
        inlines: block.inlines.map((i) =>
          i.type === 'picture'
            ? { ...i, media: keys.get(i.media) ?? i.media }
            : i.type === 'note'
              ? { ...i, blocks: rekey(i.blocks) }
              : i,
        ),
      };
    });
  const blocks = rekey(root.blocks);
  return {
    ...blank,
    styles,
    lists,
    ...(pending.size > 0 ? { media } : {}),
    body: blocks.length > 0 ? blocks : blank.body,
  };
}

/** Runs alike joined, as a paragraph holds them. */
function merged(inlines: readonly Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const inline of inlines) {
    const last = out.at(-1);
    if (
      last?.type === 'run' &&
      inline.type === 'run' &&
      last.link === inline.link &&
      JSON.stringify(last.props) === JSON.stringify(inline.props)
    )
      out[out.length - 1] = { ...last, text: last.text + inline.text };
    else out.push(inline);
  }
  return out;
}
