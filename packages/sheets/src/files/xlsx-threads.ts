// A sheet's comment threads in XLSX (docs/specs/029-sheets/standard-mapping.md "Comments in the file", D657, D658), as
// Excel writes them ([MS-XLSX] 2.3.7, 2.6.203-2.6.205): a threaded comments part a sheet, the workbook's persons part,
// and beside each thread the legacy comment Excel writes for older readers (its author `tc={id}`), in the sheet's notes
// part. What Excel's threads cannot hold rides in LiveDoc's record, an `ext` of the first comment. Ids are made from
// the sheet's, thread's and comment's places, so a file written twice is the same file.
import {
  attributeOf,
  childElement,
  childElements,
  escapeXmlAttribute,
  escapeXmlText,
  type XmlElement,
} from '@livedoc/office-packages';
import { cellAddress, readCellAddress } from './xlsx-parts';
import {
  readThreadRecord,
  threadRecordJson,
  type FileComment,
  type FileThread,
} from './file-threads';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';

export const THREADS_RELATIONSHIP =
  'http://schemas.microsoft.com/office/2017/10/relationships/threadedComment';
export const PERSONS_RELATIONSHIP =
  'http://schemas.microsoft.com/office/2017/10/relationships/person';
export const THREADS_CONTENT_TYPE = 'application/vnd.ms-excel.threadedcomments+xml';
export const PERSONS_CONTENT_TYPE = 'application/vnd.ms-excel.person+xml';
export const THREADS_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments';
const SPREADSHEETML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
/** The persons part's name in the package. */
export const PERSONS_PART = 'xl/persons/person.xml';
/** The legacy comment author Excel names a thread's placeholder by. */
export const PLACEHOLDER_AUTHOR = /^tc=/;

// Excel's words for older readers above a thread's text.
const PLACEHOLDER_HEAD =
  '[Threaded comment]\n\nYour version of Excel allows you to read this threaded comment; however, any edits to it will get removed if the file is opened in a newer version of Excel. Learn more: https://go.microsoft.com/fwlink/?linkid=870924\n\n';

const hex = (n: number, width: number) =>
  n.toString(16).toUpperCase().padStart(width, '0').slice(-width);

/** A comment's id: the sheet's, the thread's and the comment's places (`{4C495645-SSSS-4TTT-8CCC-000000000000}`). */
export const commentGuid = (sheetNo: number, thread: number, comment: number): string =>
  `{4C495645-${hex(sheetNo, 4)}-4${hex(thread, 3)}-8${hex(comment, 3)}-000000000000}`;

/** A person's id by their place in the workbook's persons. */
export const personGuid = (n: number): string => `{4C495645-0000-4000-8000-${hex(n, 12)}}`;

/** The workbook's authors by name, each a person id, in the order first met. */
export function personsOf(threads: Iterable<readonly FileThread[]>): Map<string, string> {
  const persons = new Map<string, string>();
  for (const sheet of threads)
    for (const thread of sheet)
      for (const c of thread.comments)
        if (!persons.has(c.author)) persons.set(c.author, personGuid(persons.size + 1));
  return persons;
}

/** The persons part, one person an author, by name alone. */
export function personsXml(persons: ReadonlyMap<string, string>): string {
  const people = [...persons]
    .map(
      ([name, id]) =>
        `<person displayName="${escapeXmlAttribute(name)}" id="${id}" userId="${escapeXmlAttribute(name)}" providerId="None"/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<personList xmlns="${THREADS_NS}" xmlns:x="${SPREADSHEETML}">${people}</personList>`;
}

/** A thread's placeholder for older readers: Excel's words, then the comment and each reply. */
export function placeholderText(comments: readonly FileComment[]): string {
  const said = comments.map(
    (c, i) => `${i === 0 ? 'Comment' : 'Reply'}:\n    ${c.text.replaceAll('\n', '\n    ')}`,
  );
  return PLACEHOLDER_HEAD + said.join('\n');
}

/** A placeholder legacy comment on a thread's cell, which the notes part writes in the cell's note's place (D658). */
export type ThreadPlaceholder = { r: number; c: number; author: string; text: string };

export type XlsxThreadsOut = { xml: string; placeholders: ThreadPlaceholder[] };

/**
 * A sheet's threaded comments part and the placeholders its notes part writes; `notes` the sheet's notes by place,
 * a thread's cell's carried in its record. Null for a sheet without threads.
 */
export function xlsxThreadsOut(
  threads: readonly FileThread[],
  sheetNo: number,
  persons: ReadonlyMap<string, string>,
  notes: ReadonlyMap<string, string>,
): XlsxThreadsOut | null {
  if (threads.length === 0) return null;
  const placeholders: ThreadPlaceholder[] = [];
  const taken = new Set<string>();
  const body: string[] = [];
  threads.forEach((thread, t) => {
    const place = `${thread.r1},${thread.c1}`;
    // A cell holds one legacy comment: a second thread there is written all the same, its placeholder left out.
    const rootId = commentGuid(sheetNo, t, 0);
    if (!taken.has(place)) {
      taken.add(place);
      placeholders.push({
        r: thread.r1,
        c: thread.c1,
        author: `tc=${rootId}`,
        text: placeholderText(thread.comments),
      });
    }
    const ref = cellAddress(thread.r1, thread.c1);
    const record = threadRecordJson(thread, notes.get(place));
    thread.comments.forEach((comment, i) => {
      const id = commentGuid(sheetNo, t, i);
      const attrs = [
        `ref="${ref}"`,
        `dT="${new Date(comment.at).toISOString()}"`,
        `personId="${persons.get(comment.author)}"`,
        `id="${id}"`,
        ...(i > 0 ? [`parentId="${rootId}"`] : []),
        ...(i === 0 && thread.resolved ? ['done="1"'] : []),
      ];
      const ext =
        i === 0
          ? `<extLst><x:ext uri="${LIVEDOC_SPREADSHEET_NS}" xmlns:livedoc="${LIVEDOC_SPREADSHEET_NS}"><livedoc:thread record="${escapeXmlAttribute(record)}"/></x:ext></extLst>`
          : '';
      body.push(
        `<threadedComment ${attrs.join(' ')}><text>${escapeXmlText(comment.text)}</text>${ext}</threadedComment>`,
      );
    });
  });
  return {
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ThreadedComments xmlns="${THREADS_NS}" xmlns:x="${SPREADSHEETML}">${body.join('')}</ThreadedComments>`,
    placeholders,
  };
}

/** The workbook's persons by id: their display names. */
export function readXlsxPersons(root: XmlElement): Map<string, string> {
  const persons = new Map<string, string>();
  for (const person of childElements(root)) {
    if (person.uri !== THREADS_NS || person.local !== 'person') continue;
    const id = attributeOf(person, '', 'id');
    const name = attributeOf(person, '', 'displayName');
    if (id && name !== undefined) persons.set(id, name);
  }
  return persons;
}

const textOf = (e: XmlElement | undefined): string =>
  e ? e.children.filter((x) => typeof x === 'string').join('') : '';

// LiveDoc's record in a comment's `extLst`, else null.
function recordOf(comment: XmlElement): string | null {
  const extLst = childElement(comment, THREADS_NS, 'extLst');
  for (const ext of extLst ? childElements(extLst) : []) {
    if (ext.local !== 'ext' || attributeOf(ext, '', 'uri') !== LIVEDOC_SPREADSHEET_NS) continue;
    const thread = childElement(ext, LIVEDOC_SPREADSHEET_NS, 'thread');
    const record = thread && attributeOf(thread, '', 'record');
    if (record) return record;
  }
  return null;
}

/** What a sheet's threaded comments part gives: its threads, and the notes LiveDoc's records carried (D658). */
export type ReadThreads = {
  threads: FileThread[];
  notes: { r: number; c: number; text: string }[];
};

const FROM_FILE_COLOUR = '#6b7280';

/**
 * A threaded comments part's threads: each root (no `parentId`) on its `ref` cell with its replies in time order,
 * resolved by `done`, authors by their person's name; LiveDoc's record, where it is, restores what Excel cannot hold.
 */
export function readXlsxThreads(
  root: XmlElement,
  persons: ReadonlyMap<string, string>,
): ReadThreads {
  type Read = { id: string; parent: string | null; at: number; comment: XmlElement };
  const all: Read[] = [];
  for (const comment of childElements(root)) {
    if (comment.uri !== THREADS_NS || comment.local !== 'threadedComment') continue;
    const id = attributeOf(comment, '', 'id');
    if (!id) continue;
    const at = Date.parse(attributeOf(comment, '', 'dT') ?? '');
    all.push({
      id,
      parent: attributeOf(comment, '', 'parentId') ?? null,
      at: Number.isFinite(at) ? at : 0,
      comment,
    });
  }
  const threads: FileThread[] = [];
  const notes: ReadThreads['notes'] = [];
  for (const head of all.filter((x) => x.parent === null)) {
    const place = readCellAddress(attributeOf(head.comment, '', 'ref') ?? '');
    if (!place) continue;
    const said = [head, ...all.filter((x) => x.parent === head.id).sort((a, b) => a.at - b.at)];
    const recordJson = recordOf(head.comment);
    const record = recordJson === null ? null : readThreadRecord(recordJson);
    const fromFile = said.map((x): FileComment => ({
      text: textOf(childElement(x.comment, THREADS_NS, 'text')),
      at: x.at,
      author: persons.get(attributeOf(x.comment, '', 'personId') ?? '') ?? '',
      colour: FROM_FILE_COLOUR,
    }));
    // LiveDoc's record speaks for the thread while Excel has kept it whole (as many comments, the same texts).
    const whole =
      record !== null &&
      record.comments.length === fromFile.length &&
      record.comments.every((c, i) => c.text === fromFile[i]!.text);
    const resolved = attributeOf(head.comment, '', 'done');
    threads.push({
      ...(whole ? record.range : { r1: place.r, c1: place.c, r2: place.r, c2: place.c }),
      resolved: resolved === '1' || resolved === 'true',
      comments: whole ? record.comments : fromFile,
    });
    if (whole && record.note !== undefined)
      notes.push({ r: record.range.r1, c: record.range.c1, text: record.note });
  }
  return { threads, notes };
}
