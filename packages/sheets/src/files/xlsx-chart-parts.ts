// The parts a workbook's charts and pictures add to its XLSX (docs/specs/029-sheets/standard-mapping.md "Charts in the
// file", "Pictures in the file"): per sheet with either, a drawing part and its relationship from the worksheet, a chart
// part per chart and a media part per picture's image (one however many sheets place it), named past the parts the
// file kept, its table slicers' anchors after them (xlsx-slicers.ts). A sheet keeping its file's own drawing writes
// none of its charts nor pictures (D261, D626).
import {
  PICTURE_EXTENSIONS,
  OOXML_CONTENT_TYPES,
  RELATIONSHIP_TYPES,
  XML_DECLARATION,
  type OoxmlPart,
  type Relationship,
} from '@livedoc/office-packages';
import { nearestFileChart } from './chart-nearest';
import { fileChartSum, type FileChart } from './file-charts';
import {
  picturesUnwritten,
  picturesWithBytes,
  type FilePictureBytes,
  type FilePictureFetches,
} from './file-pictures';
import type { FileSlicer } from './file-slicers';
import type { FileLoss, FileSheet } from './workbook-file';
import { xlsxChartXml, xlsxDrawingXml } from './xlsx-charts';
import { ownIds, type XlsxKeptWriter } from './xlsx-kept-write';
import { xlsxSlicerAnchorXml } from './xlsx-slicers';

export type XlsxChartParts = {
  // By sheet: the worksheet's relationship id for its drawing, and that relationship.
  sheets: ({ relId: string; rels: Relationship[] } | null)[];
  parts: OoxmlPart[];
  // Each drawing part's relationships to its charts.
  relationships: [string, Relationship[]][];
  // Names an image's media part once, adding it to `parts`: the cells' pictures share it (xlsx-cell-pictures.ts).
  media: (imageId: string, bytes: FilePictureBytes) => string;
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
  // The pictures' bytes the download read (D626).
  pictureBytes?: FilePictureFetches,
  // By sheet, its slicers Excel draws as table slicers (none on a sheet keeping its file's drawing).
  slicers: (sheet: number) => readonly FileSlicer[] = () => [],
): XlsxChartParts {
  const taken = new Set(keptParts.map((p) => p.name));
  const parts: OoxmlPart[] = [];
  const media = mediaParts(taken, parts);
  const out: XlsxChartParts = { sheets: [], parts, relationships: [], media };
  const nextOf = namer(taken);
  sheets.forEach((sheet, i) => {
    const charts = sheet.charts ?? [];
    if (kept.keepsWorksheetChild('drawing', i)) {
      if (charts.length) losses.push({ k: 'charts_unwritten', sheet: sheet.name });
      picturesUnwritten(sheet, losses);
      out.sheets.push(null);
      return;
    }
    const pictures = picturesWithBytes(sheet, pictureBytes, losses);
    const sliced = slicers(i);
    if (!charts.length && !pictures.length && !sliced.length) {
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
    // Each picture names its image's media part, after the charts' relationships.
    const pictureRels: Relationship[] = pictures.map(({ picture, bytes }, n) => ({
      id: `rId${charts.length + n + 1}`,
      type: RELATIONSHIP_TYPES.image,
      target: `../${media(picture.imageId, bytes).slice('xl/'.length)}`,
    }));
    out.parts.push({
      name: drawing,
      contentType: OOXML_CONTENT_TYPES.drawing,
      data: encode(
        xlsxDrawingXml(
          charts,
          chartRels.map((r) => r.id),
          pictures.map(({ picture }, n) => ({ picture, relId: pictureRels[n]!.id })),
          sliced.map((s, n) => xlsxSlicerAnchorXml(s, charts.length + pictures.length + n + 2)),
        ),
      ),
    });
    out.relationships.push([drawing, [...chartRels, ...pictureRels]]);
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

// The media part of each image, named `xl/media/imageN.<ext>` past the parts the file kept, added once to `parts`.
function mediaParts(
  taken: ReadonlySet<string>,
  parts: OoxmlPart[],
): (imageId: string, bytes: FilePictureBytes) => string {
  const named = new Map<string, string>();
  let n = 0;
  return (imageId, bytes) => {
    const had = named.get(imageId);
    if (had) return had;
    let name: string;
    do name = `xl/media/image${++n}.${PICTURE_EXTENSIONS[bytes.type]}`;
    while (taken.has(name));
    named.set(imageId, name);
    parts.push({ name, contentType: bytes.type, data: bytes.data });
    return name;
  };
}
