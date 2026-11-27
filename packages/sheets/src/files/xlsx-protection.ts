// Protections in XLSX (docs/specs/029-sheets/standard-mapping.md "Protection in the file", D349 to D352): a protected
// sheet is the worksheet's `sheetProtection`, the ranges it frees password-less `protectedRange`s (and, read, the cells
// whose style is not locked); LiveDoc's exact record in the worksheet's LiveDoc `ext`, fingerprinted. A protected range
// with a password stays the file's own, kept; so does every protected range of a sheet that is not protected.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  type XmlElement,
} from '@livedoc/office-packages';
import { formatRange, type GridRange } from '../address';
import {
  PROTECTION_EXCEPTIONS_MAX,
  PROTECTION_KEPT_ATTRIBUTES,
  type ProtectionKept,
} from '../protection';
import { FILE_LAST_COL, FILE_LAST_ROW } from './a1-text';
import {
  freeRectangles,
  freeRunsOf,
  protectionFingerprint,
  protectionRecordText,
  standardProtectionOf,
  type FileProtection,
  type FreeRows,
  type FreeRun,
  type ProtectionFound,
} from './file-protections';
import { readSqref } from './xlsx-format-rules';
import { readCellAddress } from './xlsx-parts';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';

const ON = new Set(['1', 'true']);

// What LiveDoc writes on every `sheetProtection` beside `sheet`; a file's own value of one is kept only when it differs.
const WRITTEN: Readonly<Record<string, string>> = { objects: '1', scenarios: '1' };

const children = (element: XmlElement | undefined, ns: string, local: string): XmlElement[] =>
  element ? childElements(element).filter((e) => e.uri === ns && e.local === local) : [];

// A protected range Excel frees only to those who know its password (or to the accounts its descriptor names).
const guarded = (range: XmlElement): boolean =>
  ['password', 'hashValue', 'securityDescriptor'].some(
    (name) => attributeOf(range, '', name) !== undefined,
  ) || childElements(range).some((e) => e.local === 'securityDescriptor');

/** The worksheet's LiveDoc `ext` (the validation rules' one), if it has one. */
export function liveDocExtOf(root: XmlElement, ns: string): XmlElement | undefined {
  const extLst = childElement(root, ns, 'extLst');
  return (extLst ? childElements(extLst) : []).find(
    (e) => e.local === 'ext' && attributeOf(e, '', 'uri') === LIVEDOC_SPREADSHEET_NS,
  );
}

// What a `sheetProtection` held that LiveDoc has no form for, as the file wrote it (D351).
function keptOf(element: XmlElement): ProtectionKept | undefined {
  const names = PROTECTION_KEPT_ATTRIBUTES.ooxml;
  const attributes: Record<string, string> = {};
  for (const { uri, local, value } of element.attributes) {
    if (uri !== '' || !names.has(local)) continue;
    const written = WRITTEN[local];
    if (written !== undefined && (value === written || (ON.has(value) && ON.has(written))))
      continue;
    attributes[local] = value;
  }
  return Object.keys(attributes).length ? { standard: 'ooxml', attributes } : undefined;
}

// The columns' free runs: each `col` whose style is not locked.
function columnRuns(root: XmlElement, ns: string, unlocked: (s: number) => boolean): FreeRun[] {
  const runs: FreeRun[] = [];
  for (const col of children(childElement(root, ns, 'cols'), ns, 'col')) {
    const style = attributeOf(col, '', 'style');
    if (style === undefined || !unlocked(Number(style))) continue;
    const min = Number(attributeOf(col, '', 'min') ?? 0) - 1;
    const max = Math.min(Number(attributeOf(col, '', 'max') ?? min + 1) - 1, FILE_LAST_COL - 1);
    if (Number.isInteger(min) && min >= 0 && max >= min) runs.push([min, max]);
  }
  return runs.sort((a, b) => a[0] - b[0]);
}

// Each row span's free runs, in order: a listed row by its cells over its row's or its columns' style, the rows
// between and after them by their columns'.
function* freeRows(
  root: XmlElement,
  ns: string,
  unlocked: (s: number) => boolean,
): Generator<FreeRows> {
  const cols = columnRuns(root, ns, unlocked);
  let next = 0;
  for (const row of children(childElement(root, ns, 'sheetData'), ns, 'row')) {
    const r = Number(attributeOf(row, '', 'r') ?? next + 1) - 1;
    if (!Number.isInteger(r) || r < next) continue;
    if (r > next && cols.length) yield { r1: next, r2: r - 1, runs: cols };
    next = r + 1;
    const s = attributeOf(row, '', 's');
    const styled = s !== undefined && ON.has(attributeOf(row, '', 'customFormat') ?? '');
    const base: FreeRun[] = styled ? (unlocked(Number(s)) ? [[0, FILE_LAST_COL - 1]] : []) : cols;
    const cells: { c: number; free: boolean }[] = [];
    let col = 0;
    for (const cell of children(row, ns, 'c')) {
      const address = attributeOf(cell, '', 'r');
      const at = address === undefined ? { r, c: col } : readCellAddress(address);
      if (!at || at.c < col) continue;
      col = at.c + 1;
      cells.push({ c: at.c, free: unlocked(Number(attributeOf(cell, '', 's') ?? 0)) });
    }
    const runs = freeRunsOf(base, cells);
    if (runs.length) yield { r1: r, r2: r, runs };
  }
  if (cols.length) yield { r1: next, r2: FILE_LAST_ROW - 1, runs: cols };
}

/** A worksheet's protection as read, and the elements read into it (so not kept). */
export type XlsxProtectionRead = ProtectionFound & { read: Set<XmlElement>; cut: boolean };

/**
 * A worksheet's protection: its `sheetProtection` (one protecting nothing is read as nothing, and not kept), the ranges
 * a protected sheet frees (its password-less `protectedRange`s, then its unlocked cells as rectangles, past 50 cut),
 * and LiveDoc's record in its LiveDoc `ext`. `unlocked` says whether a cell style (by `cellXfs` index) is not locked.
 */
export function readXlsxProtection(
  root: XmlElement,
  ns: string,
  unlocked: (s: number) => boolean,
): XlsxProtectionRead {
  const read = new Set<XmlElement>();
  const out: XlsxProtectionRead = { protected: false, free: [], read, cut: false };
  const ext = liveDocExtOf(root, ns);
  const record = ext && childElement(ext, LIVEDOC_SPREADSHEET_NS, 'protections');
  const text = record && attributeOf(record, '', 'record');
  if (text !== undefined)
    out.record = { text, fingerprint: attributeOf(record!, '', 'fingerprint') };
  const sheet = childElement(root, ns, 'sheetProtection');
  if (!sheet) return out;
  read.add(sheet);
  if (!ON.has(attributeOf(sheet, '', 'sheet') ?? '')) return out;
  out.protected = true;
  const kept = keptOf(sheet);
  if (kept) out.kept = kept;
  const named: GridRange[] = [];
  const holder = childElement(root, ns, 'protectedRanges');
  for (const range of children(holder, ns, 'protectedRange')) {
    if (guarded(range)) continue;
    const ranges = readSqref(attributeOf(range, '', 'sqref') ?? '');
    if (!ranges) continue;
    named.push(...ranges);
    read.add(range);
  }
  const styled = freeRectangles(freeRows(root, ns, unlocked));
  const free = [...named, ...styled.free];
  out.cut = styled.cut || free.length > PROTECTION_EXCEPTIONS_MAX;
  out.free = free.slice(0, PROTECTION_EXCEPTIONS_MAX);
  return out;
}

/** A sheet's protection as XLSX writes it: its standard form's elements, and LiveDoc's record for its `ext`. */
export type XlsxProtectionWritten = {
  own: { name: string; xml: string }[];
  record: string | null;
};

const attributesXml = (attributes: Readonly<Record<string, string>>) =>
  Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeXmlAttribute(value)}"`)
    .join('');

/**
 * A sheet's protections in XLSX: its standard protection as `sheetProtection` (with what an XLSX file's protection
 * kept, D351), its exceptions as password-less `protectedRange`s (cut to Excel's last column), and LiveDoc's record.
 */
export function xlsxProtectionXml(
  list: readonly FileProtection[] | undefined,
): XlsxProtectionWritten {
  if (!list?.length) return { own: [], record: null };
  const standard = standardProtectionOf(list);
  const own: { name: string; xml: string }[] = [];
  const free = (standard?.except ?? []).flatMap((g) =>
    g.c1 < FILE_LAST_COL ? [{ ...g, c2: Math.min(g.c2, FILE_LAST_COL - 1) }] : [],
  );
  if (standard) {
    const kept = standard.kept?.standard === 'ooxml' ? standard.kept.attributes : {};
    own.push({
      name: 'sheetProtection',
      xml: `<sheetProtection sheet="1"${attributesXml({ ...WRITTEN, ...kept })}/>`,
    });
    if (free.length)
      own.push({
        name: 'protectedRanges',
        xml: `<protectedRanges>${free
          .map(
            (g, i) => `<protectedRange sqref="${formatRange(g)}" name="LiveDocException${i + 1}"/>`,
          )
          .join('')}</protectedRanges>`,
      });
  }
  const fingerprint = protectionFingerprint(standard !== undefined, free);
  return {
    own,
    record: `<livedoc:protections record="${escapeXmlAttribute(protectionRecordText(list))}" fingerprint="${fingerprint}"/>`,
  };
}

/** The worksheet's one LiveDoc `ext`: the validation rules' (if any) with the other records (protections', tables') inside it. */
export function liveDocExtXml(
  validations: string | null,
  ...records: (string | null)[]
): string | null {
  const record = records.filter((r) => r !== null).join('');
  if (record === '') return validations;
  if (validations === null)
    return `<ext uri="${LIVEDOC_SPREADSHEET_NS}" xmlns:livedoc="${LIVEDOC_SPREADSHEET_NS}">${record}</ext>`;
  const end = validations.lastIndexOf('</ext>');
  return `${validations.slice(0, end)}${record}${validations.slice(end)}`;
}
