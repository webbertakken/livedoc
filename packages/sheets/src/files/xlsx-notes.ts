// Cells' notes in XLSX (docs/specs/029-sheets/standard-mapping.md "Notes in the file", D648, D649, D651): a sheet's
// notes part (`xl/comments<n>.xml`, Excel's legacy comments) and the VML drawing Excel shows each note by, named by
// the worksheet's `legacyDrawing`. Read whole and written by LiveDoc, so neither is kept.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  type Relationship,
  type XmlElement,
} from '@livedoc/office-packages';
import { cellAddress, readCellAddress } from './xlsx-parts';
import type { FileCell } from './workbook-file';
import { PLACEHOLDER_AUTHOR, type ThreadPlaceholder } from './xlsx-threads';

// A legacy comment written: a note (author 0, LiveDoc) or a thread's placeholder (its own `tc=` author).
type Commented = { r: number; c: number; text: string; author: number };

const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
/** The relationship a worksheet names its notes part by, and its VML drawing by. */
export const NOTES_RELATIONSHIP = `${RELS}/comments`;
export const VML_RELATIONSHIP = `${RELS}/vmlDrawing`;
/** The notes part's content type, and the VML extension's default one. */
export const NOTES_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml';
export const VML_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.vmlDrawing';
// The one author LiveDoc writes (D649): Google's notes have none.
const NOTES_AUTHOR = 'LiveDoc';
const SPREADSHEETML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/** A note the file puts on a cell, zero-based. */
export type ReadNote = { r: number; c: number; text: string };

// A rich text's runs' text, or its own `t`, joined.
function richText(text: XmlElement, ns: string): string {
  let out = '';
  for (const child of childElements(text)) {
    if (child.uri !== ns) continue;
    if (child.local === 't') out += child.children.filter((x) => typeof x === 'string').join('');
    else if (child.local === 'r') {
      const t = childElement(child, ns, 't');
      if (t) out += t.children.filter((x) => typeof x === 'string').join('');
    }
  }
  return out;
}

/**
 * A notes part's notes: each `comment` naming one cell, its runs' text joined; its author's not read (D649), save that a
 * thread's placeholder (its author `tc={id}`) is the thread's and no note ("Comments in the file").
 */
export function readXlsxNotes(root: XmlElement): ReadNote[] {
  const ns = root.uri;
  const list = childElement(root, ns, 'commentList');
  if (!list) return [];
  const authorsEl = childElement(root, ns, 'authors');
  const authors = (authorsEl ? childElements(authorsEl) : [])
    .filter((a) => a.uri === ns && a.local === 'author')
    .map((a) => a.children.filter((x) => typeof x === 'string').join(''));
  const out: ReadNote[] = [];
  for (const comment of childElements(list)) {
    if (comment.uri !== ns || comment.local !== 'comment') continue;
    const author = authors[Number(attributeOf(comment, '', 'authorId') ?? -1)] ?? '';
    if (PLACEHOLDER_AUTHOR.test(author)) continue;
    const at = readCellAddress(attributeOf(comment, '', 'ref') ?? '');
    const text = childElement(comment, ns, 'text');
    if (!at || !text) continue;
    const said = richText(text, ns);
    if (said !== '') out.push({ r: at.r, c: at.c, text: said });
  }
  return out;
}

/** The notes on the sheet's cells, a cell made for a note on none; past the sheet's limits, left out. */
export function cellsNoted(
  cells: FileCell[],
  notes: readonly ReadNote[],
  limits: { rows: number; cols: number },
): void {
  if (notes.length === 0) return;
  const byPlace = new Map(cells.map((cell) => [`${cell.r},${cell.c}`, cell]));
  for (const { r, c, text } of notes) {
    if (r >= limits.rows || c >= limits.cols) continue;
    const cell = byPlace.get(`${r},${c}`);
    if (cell) cell.note = text;
    else {
      const made: FileCell = { r, c, note: text };
      cells.push(made);
      byPlace.set(`${r},${c}`, made);
    }
  }
}

/** The relationship id `base` names, or the first `base<n>` a kept relationship does not hold. */
export function freeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export type XlsxNotesOut = {
  parts: { name: string; contentType: string; xml: string }[];
  rels: Relationship[];
  // The worksheet's `legacyDrawing`.
  legacyDrawing: string;
};

/**
 * A sheet's notes part and VML drawing (`sheetNo` one-based, naming both parts), their relationships with ids free of
 * the sheet's kept ones; null for a sheet without notes or threads. A thread's placeholder takes its cell's legacy
 * comment, the note there being carried by the thread's record (D658).
 */
export function xlsxNotesOut(
  cells: readonly FileCell[],
  sheetNo: number,
  kept: readonly Relationship[],
  placeholders: readonly ThreadPlaceholder[] = [],
): XlsxNotesOut | null {
  const held = new Set(placeholders.map((p) => `${p.r},${p.c}`));
  const authors = [NOTES_AUTHOR, ...placeholders.map((p) => p.author)];
  const noted: Commented[] = [
    ...cells
      .filter((cell) => cell.note !== undefined && !held.has(`${cell.r},${cell.c}`))
      .map((cell) => ({ r: cell.r, c: cell.c, text: cell.note!, author: 0 })),
    ...placeholders.map((p, i) => ({ r: p.r, c: p.c, text: p.text, author: i + 1 })),
  ].sort((a, b) => a.r - b.r || a.c - b.c);
  if (noted.length === 0) return null;
  const taken = new Set(kept.map((r) => r.id));
  const notesId = freeId('rIdNotes', taken);
  const vmlId = freeId('rIdNotesVml', taken);
  const comments = noted
    .map(
      (cell) =>
        `<comment ref="${cellAddress(cell.r, cell.c)}" authorId="${cell.author}"><text><r><t xml:space="preserve">${escapeXmlText(cell.text)}</t></r></text></comment>`,
    )
    .join('');
  const authorsXml = authors.map((a) => `<author>${escapeXmlText(a)}</author>`).join('');
  const notesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<comments xmlns="${SPREADSHEETML}"><authors>${authorsXml}</authors><commentList>${comments}</commentList></comments>`;
  return {
    parts: [
      { name: `xl/comments${sheetNo}.xml`, contentType: NOTES_CONTENT_TYPE, xml: notesXml },
      {
        name: `xl/drawings/vmlDrawing${sheetNo}.vml`,
        contentType: VML_CONTENT_TYPE,
        xml: vmlXml(noted, sheetNo),
      },
    ],
    rels: [
      { id: notesId, type: NOTES_RELATIONSHIP, target: `../comments${sheetNo}.xml` },
      { id: vmlId, type: VML_RELATIONSHIP, target: `../drawings/vmlDrawing${sheetNo}.vml` },
    ],
    legacyDrawing: `<legacyDrawing r:id="${escapeXmlAttribute(vmlId)}"/>`,
  };
}

// Excel's note shapes: one shape type, then a hidden yellow box a note, anchored beside its cell (two columns right,
// four rows down), its ids in the sheet's own block of 1,024 (`o:idmap`).
function vmlXml(noted: readonly { r: number; c: number }[], sheetNo: number): string {
  const shapes = noted.map((cell, i) => {
    const id = sheetNo * 1024 + i + 1;
    const anchor = [cell.c + 1, 15, Math.max(0, cell.r - 1), 10, cell.c + 3, 15, cell.r + 3, 4];
    return (
      `<v:shape id="_x0000_s${id}" type="#_x0000_t202" style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:108pt;height:59.25pt;z-index:${i + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto">` +
      '<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/>' +
      '<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>' +
      `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${anchor.join(', ')}</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${cell.r}</x:Row><x:Column>${cell.c}</x:Column></x:ClientData>` +
      '</v:shape>'
    );
  });
  return (
    '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${sheetNo}"/></o:shapelayout>` +
    '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>' +
    shapes.join('') +
    '</xml>'
  );
}
