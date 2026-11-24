// docs/specs/029-sheets/standard-mapping.md "The corpus" (D119): every file other suites wrote is read, made into
// sheets, written in its own format and read again with nothing lost it did not name, and written in the other
// standard; every loss each step names is the one recorded for the file (corpus/losses.json), so none is silent.
// CORPUS_UPDATE=1 writes the record afresh, to be read in review.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sheetFromJson } from '../sheet-json';
import type { Sheet } from '../sheet';
import { WorkbookRecord, type WorkbookFormat } from '../workbook-record';
import { workbookConversion } from './conversion';
import { fileKept } from './kept-anchors';
import type { KeptContent, StoredAt } from './kept-content';
import { readWorkbookFile } from './read-workbook-file';
import { sheetsFromFile, type FileLoss } from './workbook-file';
import { workbookFileFor, writeWorkbook } from './write-workbook';

const CORPUS = join(import.meta.dirname, '..', '..', 'corpus');
const LOSSES = join(CORPUS, 'losses.json');
const FOLDERS = ['excel', 'libreoffice', 'google'] as const;
const made = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

type Counted = Record<string, number>;
type Record_ = { read: Counted; written: Counted; reread: Counted; converted: string[] };

const counted = (losses: readonly FileLoss[]): Counted =>
  Object.fromEntries(
    [
      ...losses.reduce((m, l) => m.set(l.k, (m.get(l.k) ?? 0) + 1), new Map<string, number>()),
    ].sort(),
  );

let n = 13;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const BY = { id: 'corpus', name: 'Corpus', color: '#000000' };

// A file opened as LiveDoc opens one: its sheets, kept content and every loss named.
async function opened(bytes: Uint8Array<ArrayBuffer>) {
  const read = await readWorkbookFile(bytes, made.settings.locale);
  if (!read.ok) throw new Error(read.rejection);
  const sheetsMade = sheetsFromFile(read.file, made.settings.locale, rand);
  const sheets: Sheet[] = sheetsMade.sheets.map((s, i) =>
    sheetFromJson({ ...s, tabId: `tab${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
  );
  return {
    format: read.format,
    sheets,
    kept: sheetsMade.kept,
    losses: [...read.losses, ...sheetsMade.losses],
  };
}

// What a workbook holds, by position: each sheet's name, grid and cells (formula, worked-out value, format), and its
// kept content by where it sits.
function held(sheets: readonly Sheet[], record: WorkbookRecord, kept?: KeptContent<StoredAt>) {
  const file = workbookFileFor(sheets, record);
  const placed = kept ? fileKept(kept, sheets).kept : undefined;
  return {
    sheets: file.sheets,
    kept: placed
      ? {
          standard: placed.standard,
          items: placed.items.map((i) => `${i.place}@${JSON.stringify(i.at)}:${i.xml}`).sort(),
          parts: placed.parts.map((p) => `${p.name}:${p.data.byteLength}`).sort(),
          relationships: placed.relationships.map((r) => `${r.from}:${r.id}:${r.target}`).sort(),
        }
      : null,
  };
}

const files = FOLDERS.flatMap((folder) =>
  readdirSync(join(CORPUS, folder))
    .filter((f) => /\.(xlsx|ods|fods)$/.test(f))
    .sort()
    .map((f) => `${folder}/${f}`),
);
// How long one file's round trip may take, under coverage on a CI runner (the largest takes about 7 s there).
const CORPUS_FILE_TIMEOUT_MS = 30_000;
const recorded = JSON.parse(readFileSync(LOSSES, 'utf8')) as Record<string, Record_>;
const found: Record<string, Record_> = {};

describe('the corpus', () => {
  it.each(files)(
    '%s round-trips, every loss named and recorded',
    async (path) => {
      const first = await opened(new Uint8Array(readFileSync(join(CORPUS, path))));
      const record = WorkbookRecord.opened(made, first.format);
      const title = path.replace(/^.*\/|\.[^.]+$/g, '');
      const own = writeWorkbook(first.sheets, record, title, first.format, first.kept);
      const second = await opened(own.data);
      // The second read holds what the first made, by position: nothing lost that was not named.
      expect(held(second.sheets, record, second.kept)).toEqual(
        held(first.sheets, record, first.kept),
      );
      const other: WorkbookFormat = first.format === 'xlsx' ? 'ods' : 'xlsx';
      const conversion = workbookConversion(first.sheets, record, other, first.kept);
      found[path] = {
        read: counted(first.losses),
        written: counted(own.losses),
        reread: counted(second.losses),
        converted: conversion.losses.map((l) => l.k).sort(),
      };
      if (process.env.CORPUS_UPDATE !== '1') expect(found[path]).toEqual(recorded[path]);
      // A whole file read, written and read again, compared cell by cell: the largest holds 52,000 styled cells, seconds
      // under coverage.
    },
    CORPUS_FILE_TIMEOUT_MS,
  );

  it('records every file of the corpus, and no other', () => {
    if (process.env.CORPUS_UPDATE === '1')
      writeFileSync(LOSSES, `${JSON.stringify(found, null, 2)}\n`);
    expect(Object.keys(process.env.CORPUS_UPDATE === '1' ? found : recorded).sort()).toEqual(
      [...files].sort(),
    );
  });
});
