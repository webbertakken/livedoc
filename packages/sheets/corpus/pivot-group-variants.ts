// Excel's pivot table sample (`excel/ExcelPivotTableSample.xlsx`) grouped three ways, as Excel writes a grouping
// (docs/specs/029-sheets/standard-mapping.md "Pivot tables in the file", D617, D618): its date column by month in
// place, its first column's items into a named group by a field of its own, and its number column by intervals in
// place. LibreOffice saves each as ODS and XLSX for the corpus (make-corpus.make.ts, CORPUS_SOURCE=libreoffice-groups).

/** The cache definition and pivot table part of one grouping. */
export type PivotGroupVariant = { cache: string; table: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Every item shown, and the layout's cached item lists left out (LibreOffice works them out again).
const plain = (table: string) =>
  table
    .replace(/<item h="1" x="1"\/>/g, '<item x="1"/>')
    .replace(/<rowItems.*?<\/rowItems>/, '')
    .replace(/<colItems.*?<\/colItems>/, '');

function edited(text: string, from: string | RegExp, to: string): string {
  const next = text.replace(from, to);
  if (next === text)
    throw new Error(`[sheets corpus] pivot group variant: ${String(from)} not found`);
  return next;
}

/** Each grouping of the sample's first pivot table, by name. */
export function pivotGroupVariants(
  cache: string,
  table: string,
): Record<string, PivotGroupVariant> {
  const items = (n: number) =>
    `<items count="${n + 1}">${Array.from({ length: n }, (_, i) => `<item x="${i}"/>`).join('')}<item t="default"/></items>`;
  return {
    months: {
      cache: edited(
        cache,
        '</sharedItems></cacheField></cacheFields>',
        `</sharedItems><fieldGroup base="2"><rangePr groupBy="months" startDate="2022-01-01T00:00:00" endDate="2022-01-04T00:00:00"/><groupItems count="14"><s v="&lt;01.01.2022"/>${MONTHS.map((m) => `<s v="${m}"/>`).join('')}<s v="&gt;04.01.2022"/></groupItems></fieldGroup></cacheField></cacheFields>`,
      ),
      table: plain(
        edited(
          table,
          /<pivotField axis="axisCol" numFmtId="16" showAll="0"><items count="4">.*?<\/items><\/pivotField>/,
          `<pivotField axis="axisCol" numFmtId="16" showAll="0">${items(14)}</pivotField>`,
        ),
      ),
    },
    discrete: {
      cache: edited(
        edited(
          edited(cache, '<cacheFields count="3">', '<cacheFields count="4">'),
          '<s v="c"/></sharedItems></cacheField>',
          '<s v="c"/></sharedItems><fieldGroup par="3"/></cacheField>',
        ),
        '</cacheField></cacheFields>',
        '</cacheField><cacheField name="Field12" numFmtId="0" databaseField="0"><fieldGroup base="0"><discretePr count="3"><x v="0"/><x v="0"/><x v="1"/></discretePr><groupItems count="2"><s v="Group1"/><s v="c"/></groupItems></fieldGroup></cacheField></cacheFields>',
      ),
      table: plain(
        edited(
          edited(
            edited(
              table,
              '<pivotFields count="3"><pivotField axis="axisRow" showAll="0"><items count="4"><item x="0"/><item h="1" x="1"/><item x="2"/><item t="default"/></items></pivotField>',
              `<pivotFields count="4"><pivotField showAll="0">${items(3)}</pivotField>`,
            ),
            '</pivotField></pivotFields>',
            `</pivotField><pivotField axis="axisRow" showAll="0">${items(2)}</pivotField></pivotFields>`,
          ),
          '<rowFields count="1"><field x="0"/></rowFields>',
          '<rowFields count="1"><field x="3"/></rowFields>',
        ),
      ),
    },
    intervals: {
      cache: edited(
        cache,
        'containsInteger="1" minValue="1" maxValue="3"/></cacheField>',
        'containsInteger="1" minValue="1" maxValue="3"/><fieldGroup base="1"><rangePr autoStart="0" autoEnd="0" startNum="0" endNum="4" groupInterval="2"/><groupItems count="4"><s v="&lt;0"/><s v="0-1"/><s v="2-3"/><s v="&gt;4"/></groupItems></fieldGroup></cacheField>',
      ),
      table: plain(
        edited(
          edited(
            edited(
              table,
              '<pivotField dataField="1" showAll="0"/>',
              `<pivotField axis="axisRow" dataField="1" showAll="0">${items(4)}</pivotField>`,
            ),
            '<pivotField axis="axisRow" showAll="0"><items count="4"><item x="0"/><item h="1" x="1"/><item x="2"/><item t="default"/></items></pivotField>',
            '<pivotField showAll="0"/>',
          ),
          '<rowFields count="1"><field x="0"/></rowFields>',
          '<rowFields count="1"><field x="1"/></rowFields>',
        ),
      ),
    },
  };
}
