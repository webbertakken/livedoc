// The parts a workbook's charts add to its XLSX (docs/specs/029-sheets/standard-mapping.md "Charts in the file"): per
// sheet with charts, a drawing part and its relationship from the worksheet, and a chart part per chart, named past
// the parts the file kept. A sheet keeping its file's own drawing writes none of its charts (D261).
import {
  OOXML_CONTENT_TYPES,
  RELATIONSHIP_TYPES,
  XML_DECLARATION,
  type OoxmlPart,
  type Relationship,
} from '@livedoc/office-packages';
import { nearestFileChart } from './chart-nearest';
import { fileChartSum, type FileChart } from './file-charts';
import type { FileLoss, FileSheet } from './workbook-file';
import { xlsxChartXml, xlsxDrawingXml } from './xlsx-charts';
import { ownIds, type XlsxKeptWriter } from './xlsx-kept-write';

export type XlsxChartParts = {
  // By sheet: the worksheet's relationship id for its drawing, and that relationship.
  sheets: ({ relId: string; rels: Relationship[] } | null)[];
  parts: OoxmlPart[];
  // Each drawing part's relationships to its charts.
  relationships: [string, Relationship[]][];
};

const encode = (xml: string) => new TextEncoder().encode(`${XML_DECLARATION}\n${xml}\n`);

// The next free name of a numbered part: `xl/charts/chart1.xml`, `chart2.xml`, ... none the file kept.
function namer(taken: ReadonlySet<string>): (dir: string, stem: string) => number {
  const next = new Map<string, number>();
  return (dir, stem) => {
    let n = next.get(stem) ?? 0;
    do n++;
    while (taken.has(`xl/${dir}/${stem}${n}.xml`));
    next.set(stem, n);
    return n;
  };
}

// A read chart's own XML, while the chart sums as it was read (D276); a chart changed since is written anew, named.
function keptChart(
  chart: FileChart,
  kept: XlsxKeptWriter,
  sheet: string,
  losses: FileLoss[],
): Uint8Array | null {
  const own = chart.kept && kept.part(chart.kept.part);
  if (!own) return null;
  if (fileChartSum(chart) === chart.kept!.sum) return own.data;
  losses.push({ k: 'chart_rewritten', sheet });
  return null;
}

export function xlsxChartParts(
  sheets: readonly FileSheet[],
  kept: XlsxKeptWriter,
  keptParts: readonly OoxmlPart[],
  renamed: ReadonlyMap<string, string>,
  losses: FileLoss[],
): XlsxChartParts {
  const out: XlsxChartParts = { sheets: [], parts: [], relationships: [] };
  const nextOf = namer(new Set(keptParts.map((p) => p.name)));
  sheets.forEach((sheet, i) => {
    const charts = sheet.charts ?? [];
    if (!charts.length || kept.keepsWorksheetChild('drawing', i)) {
      if (charts.length) losses.push({ k: 'charts_unwritten', sheet: sheet.name });
      out.sheets.push(null);
      return;
    }
    const name = renamed.get(sheet.name) ?? sheet.name;
    const drawing = `xl/drawings/drawing${nextOf('drawings', 'drawing')}.xml`;
    const chartRels: Relationship[] = charts.map((chart, n) => {
      const part = `chart${nextOf('charts', 'chart')}.xml`;
      // A type no format holds is written as the nearest, and named (D290).
      if (nearestFileChart(chart, 'xlsx').original)
        losses.push({ k: 'chart_nearest_type', sheet: sheet.name });
      out.parts.push({
        name: `xl/charts/${part}`,
        contentType: OOXML_CONTENT_TYPES.chart,
        data: keptChart(chart, kept, sheet.name, losses) ?? encode(xlsxChartXml(name, chart)),
      });
      return { id: `rId${n + 1}`, type: RELATIONSHIP_TYPES.chart, target: `../charts/${part}` };
    });
    out.parts.push({
      name: drawing,
      contentType: OOXML_CONTENT_TYPES.drawing,
      data: encode(
        xlsxDrawingXml(
          charts,
          chartRels.map((r) => r.id),
        ),
      ),
    });
    out.relationships.push([drawing, chartRels]);
    const relId = ownIds(kept.relationships('sheet', i))();
    out.sheets.push({
      relId,
      rels: [
        {
          id: relId,
          type: RELATIONSHIP_TYPES.drawing,
          target: `../${drawing.slice('xl/'.length)}`,
        },
      ],
    });
  });
  return out;
}
