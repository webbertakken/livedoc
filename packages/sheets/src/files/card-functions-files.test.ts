// docs/specs/029-sheets/plan-links.md "The `CARD` functions": in a file each card function is written by S5's
// convention with its cached value, in both formats, from the engine the api gave the cards.
import { describe, expect, it } from 'vitest';
import { CARDS_UNSET, unavailableCards, type CardSource } from '../cards';
import { book } from '../testing/book';
import { WorkbookRecord } from '../workbook-record';
import { writeWorkbook } from './write-workbook';
import { readXlsx } from './xlsx-read';

const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const CARDS: CardSource = {
  version: 1,
  cards: () => [{ key: 1 }, { key: 2 }, { key: 3 }],
  fieldOf: () => null,
  knowsField: () => true,
};

function written(cards: CardSource) {
  const b = book({ A1: '=CARDCOUNT()' }, { cards });
  return (format: 'fods' | 'xlsx') =>
    writeWorkbook(b.sheets, record, 'Cards', format, undefined, undefined, b.wb).data;
}

describe('card functions in a file', () => {
  it('caches the count the cards gave in ODF, under LiveDoc’s prefix', () => {
    const text = new TextDecoder().decode(written(CARDS)('fods'));
    expect(text).toMatch(
      /table:formula="of:=ORG\.LIVEDOC\.CARDCOUNT\(\)" office:value-type="float"[^>]*office:value="3"/,
    );
  });

  it('caches it in XLSX by S5’s convention, and reads the formula back', async () => {
    const data = written(CARDS)('xlsx');
    const read = await readXlsx(data);
    if (!read.ok) throw new Error(read.rejection);
    const cell = read.file.sheets[0]!.cells.find((c) => c.formula !== undefined)!;
    expect(cell.formula).toBe('=CARDCOUNT()');
    expect(cell.value).toEqual({ k: 'n', v: 3 });
  });

  it('caches #REF! when the cards cannot be read', () => {
    const text = new TextDecoder().decode(written(unavailableCards(CARDS_UNSET))('fods'));
    expect(text).toContain('#REF!');
  });
});
