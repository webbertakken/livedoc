// docs/specs/029-sheets/standard-mapping.md "Unknown content" (D104, D124): an ODF sheet sized by hand is named, its
// sizes not read yet; "Number formats in the file" (D123): a line's default format over empty cells is not named.
import { describe, expect, it } from 'vitest';
import { flatOds } from '../testing/hand-files';
import { readOds } from './ods-read';

const column = (name: string, width: string) =>
  `<style:style style:name="${name}" style:family="table-column"><style:table-column-properties style:column-width="${width}"/></style:style>`;
const row = (name: string, height: string, optimal?: boolean) =>
  `<style:style style:name="${name}" style:family="table-row"><style:table-row-properties style:row-height="${height}"` +
  `${optimal === undefined ? '' : ` style:use-optimal-row-height="${optimal}"`}/></style:style>`;
const STYLES =
  column('co1', '0.889in') +
  column('co2', '2in') +
  row('ro1', '0.178in', true) +
  row('ro2', '0.5in', false) +
  row('ro3', '12.76pt', false) +
  row('ro4', '15pt', false) +
  row('ro5', '1in', true) +
  '<style:style style:name="ro6" style:family="table-row"><style:table-row-properties style:use-optimal-row-height="true"/></style:style>' +
  '<style:style style:name="pp" style:family="paragraph"/>';
const CELL = '<table:table-cell office:value-type="float" office:value="1"/>';
const line = (local: string, style: string, repeat = 1) =>
  `<table:table-${local} table:style-name="${style}"${repeat > 1 ? ` table:number-${local}s-repeated="${repeat}"` : ''}>` +
  `${local === 'row' ? CELL : ''}</table:table-${local}>`;

async function lossesOf(table: string) {
  const read = await readOds(flatOds('', STYLES, table));
  if (!read.ok) throw new Error(read.rejection);
  return read.losses;
}

describe('an ODF sheet sized by hand (D124)', () => {
  it('is named when its columns are of more than one width, the last run left out', async () => {
    expect(
      await lossesOf(
        line('column', 'co1') +
          line('column', 'co2') +
          line('column', 'co1', 9) +
          line('row', 'ro1'),
      ),
    ).toEqual([{ k: 'sizes_unread', sheet: 'S' }]);
    expect(
      await lossesOf(line('column', 'co1', 3) + line('column', 'co2', 900) + line('row', 'ro1')),
    ).toEqual([]);
  });

  it('is named when a row not at its text’s height makes rows of more than one height', async () => {
    expect(
      await lossesOf(line('row', 'ro1') + line('row', 'ro2') + line('row', 'ro1', 99)),
    ).toEqual([{ k: 'sizes_unread', sheet: 'S' }]);
    // Google gives every row a height not its text's, the same one but at the grid's end.
    expect(
      await lossesOf(line('row', 'ro3', 5) + line('row', 'ro3') + line('row', 'ro4', 999)),
    ).toEqual([]);
    // Rows inside headers and groups count too.
    expect(
      await lossesOf(
        '<table:table-header-rows>' +
          line('row', 'ro1') +
          '</table:table-header-rows>' +
          `<table:table-row-group>${line('row', 'ro2')}${line('row', 'ro2')}</table:table-row-group>` +
          line('row', 'ro1'),
      ),
    ).toEqual([{ k: 'sizes_unread', sheet: 'S' }]);
    // Rows at their text's height differ as their text does; a row of no known style has no size.
    expect(
      await lossesOf(
        line('row', 'ro1') +
          line('row', 'ro5') +
          line('row', 'unknown') +
          line('row', 'ro6') +
          line('row', 'ro1'),
      ),
    ).toEqual([]);
  });

  it('reads sizes inside column groups and headers, past other elements', async () => {
    expect(
      await lossesOf(
        '<table:table-column-group>' +
          line('column', 'co1') +
          '</table:table-column-group>' +
          `<table:table-header-columns>${line('column', 'co2')}</table:table-header-columns>` +
          '<table:named-expressions/>' +
          line('column', 'co1') +
          line('row', 'ro1'),
      ),
    ).toEqual([{ k: 'sizes_unread', sheet: 'S' }]);
  });
});

describe('a line’s default format (D123)', () => {
  it('formats the cells the file fills, and is not named over the empty ones', async () => {
    const percent =
      '<number:percentage-style style:name="P"><number:number number:decimal-places="0" number:min-integer-digits="1"/>' +
      '<number:text>%</number:text></number:percentage-style>' +
      '<style:style style:name="ce1" style:family="table-cell" style:data-style-name="P"/>';
    const read = await readOds(
      flatOds(
        '',
        percent,
        '<table:table-column table:default-cell-style-name="ce1" table:number-columns-repeated="300"/>' +
          `<table:table-row>${CELL}</table:table-row>`,
      ),
    );
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 'n', v: 1 }, format: '0%' },
    ]);
    expect(read.losses).toEqual([]);
  });
});
