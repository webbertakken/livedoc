// Sets a mark's runs in the mark faces (docs/specs/035-pdf-documents/marks.md "Laying out", "Loading"): the faces a
// bake's marks use are loaded through a source (a browser fetches LiveDoc's own assets, Node reads the packages), and
// each run is shaped by HarfBuzz into glyphs placed where shaping puts them, each glyph with the characters it was
// shaped from; a line's embedding levels (UAX 9) come from bidi-js. HarfBuzz and bidi-js are loaded only here, the
// first time a bake needs a face.
import type { Mark } from '../mark';
import { MarkFaces, type MarkRun } from '../mark-faces';
import { MARK_FACE_DATA } from '../mark-face-data';
import type { MarkFaceSlice } from '../mark-face-families';
import { MarkFaceSlices } from '../mark-face-slices';
import { MarkWords } from '../mark-words';
import { Sfnt, type FaceMetrics, type SfntTables } from './sfnt';
import { sliceIndex, splitRun } from './region-slices';
import { woffTables } from './woff';

/** Answers a mark face's file, as a path within the Fontsource packages (`noto-sans/files/…`). */
export type MarkFaceSource = (file: string) => Promise<Uint8Array<ArrayBuffer>>;

/** A face asked of a typesetter that did not load it: a failure with a name of its own. */
export class FaceNotLoaded extends Error {
  override readonly name = 'FaceNotLoaded';
  readonly face: string;
  constructor(face: string) {
    super(`the mark face ${face} did not load`);
    this.face = face;
  }
}

/** A shaped glyph, its advance and offsets in thousandths of the size; `text` what it was shaped from, or ''. */
export type ShapedGlyph = {
  readonly glyph: number;
  readonly advance: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly text: string;
};

export type ShapedRun = {
  readonly face: string;
  readonly glyphs: readonly ShapedGlyph[];
  /** How wide it is set, in thousandths of the size. */
  readonly width: number;
};

/** A face loaded for a bake: its tables, what its descriptor says, and each glyph's advance in thousandths. */
export type LoadedFace = {
  readonly id: string;
  readonly tables: SfntTables;
  readonly metrics: FaceMetrics;
  readonly advances: readonly number[];
};

export type Typesetter = {
  readonly face: (id: string) => LoadedFace;
  /** A run in its face, in visual order. */
  readonly shape: (run: MarkRun, rtl: boolean) => ShapedRun;
  /**
   * A line's embedding level for each code unit (UAX 9), from its own direction: odd reads right to left; spaces at
   * its end at the line's own level (rule L1).
   */
  readonly levels: (text: string, rtl: boolean) => readonly number[];
  /** How many bytes the faces loaded were. */
  readonly bytes: number;
  /** How many faces were loaded, each slice of a region one. */
  readonly count: number;
  /** A run as the faces it is shaped in: a region's cut slice by slice, any other as it is. */
  readonly split: (run: MarkRun) => readonly MarkRun[];
};

type HarfBuzz = typeof import('harfbuzzjs');
type Bidi = ReturnType<(typeof import('bidi-js'))['default']>;

/** The kinds of character UAX 9's rule L1 sets back to the line's level at its end. */
const LINE_END = new Set([
  'WS',
  'S',
  'B',
  'BN',
  'LRI',
  'RLI',
  'FSI',
  'PDI',
  'LRE',
  'RLE',
  'LRO',
  'RLO',
  'PDF',
]);

/** A line's levels by bidi-js, rule L1 applied. */
function levelsBy(bidi: Bidi, text: string, rtl: boolean): number[] {
  const base = rtl ? 1 : 0;
  const levels = Array.from(bidi.getEmbeddingLevels(text, rtl ? 'rtl' : 'ltr').levels);
  for (
    let at = text.length - 1;
    at >= 0 && LINE_END.has(bidi.getBidiCharTypeName(text[at]!));
    at -= 1
  )
    levels[at] = base;
  return levels;
}

/** The runs the marks' words are set in, in the mark faces: none where Helvetica writes every mark. */
export function markRunsOf(marks: readonly Mark[]): MarkRun[] {
  const runs: MarkRun[] = [];
  for (const mark of marks) {
    const words = MarkWords.of(mark);
    if (words?.faces !== 'noto') continue;
    for (const line of words.lines) runs.push(...MarkFaces.runs({ ...line, region: words.region }));
  }
  return runs;
}

/** The mark faces the marks' words are set in, a region's as its one face. */
export const markFacesOf = (marks: readonly Mark[]): ReadonlySet<string> =>
  new Set(markRunsOf(marks).map((run) => run.face));

/** The faces loaded, or the first that did not load: `shaper` where HarfBuzz itself did not. */
export type TypesetterLoad =
  | { readonly ok: true; readonly typesetter: Typesetter }
  | { readonly ok: false; readonly face: string };

/** A face's file read and its tables taken apart; null where it did not load or does not read. */
async function readFace(id: string, file: string | undefined, source: MarkFaceSource) {
  if (!file) return null;
  try {
    const woff = await source(file);
    const tables = await woffTables(woff);
    const metrics = Sfnt.metrics(tables);
    const per = 1000 / metrics.unitsPerEm;
    const face: LoadedFace = {
      id,
      tables,
      metrics,
      advances: Sfnt.advances(tables).map((units) => units * per),
    };
    return { face, per, bytes: woff.byteLength };
  } catch {
    return null;
  }
}

/** A region's slices and which holds each character. */
type RegionSlices = {
  readonly slices: readonly MarkFaceSlice[];
  readonly index: ReadonlyMap<number, MarkFaceSlice>;
};

/** The slices of each region the runs set; the first region whose slices did not load, where one did not. */
async function regionSlicesOf(runs: readonly MarkRun[]) {
  const regions = new Map<string, RegionSlices>();
  for (const face of new Set(runs.map((run) => run.face))) {
    const region = MarkFaceSlices.regionOf(face);
    if (!region) continue;
    const slices = await MarkFaceSlices.load(region).catch(() => null);
    if (!slices) return { ok: false as const, face };
    regions.set(face, { slices, index: sliceIndex(slices) });
  }
  return { ok: true as const, regions };
}

/** The faces the runs are set in, loaded and ready to shape (marks.md "Loading"): a region's, the slices it uses. */
export async function loadTypesetter(
  runs: Iterable<MarkRun>,
  source: MarkFaceSource,
): Promise<TypesetterLoad> {
  const all = [...runs];
  const sliced = await regionSlicesOf(all);
  if (!sliced.ok) return { ok: false, face: sliced.face };
  const { regions } = sliced;
  const split = (run: MarkRun): readonly MarkRun[] => {
    const region = regions.get(run.face);
    return region ? splitRun(run, region.index, region.slices) : [run];
  };
  const files = new Map<string, string>();
  for (const face of MARK_FACE_DATA) files.set(face.id, face.file);
  for (const { slices } of regions.values())
    for (const slice of slices) files.set(slice.id, slice.file);
  const wanted = [...new Set(all.flatMap((run) => split(run).map((each) => each.face)))];
  const read = await Promise.all(wanted.map((id) => readFace(id, files.get(id), source)));
  const failed = wanted.find((_, at) => read[at] === null);
  if (failed !== undefined) return { ok: false, face: failed };
  const [hb, bidiFactory] = await Promise.all([
    import('harfbuzzjs').catch((): HarfBuzz | null => null),
    import('bidi-js').then((module) => module.default).catch(() => null),
  ]);
  if (!hb || !bidiFactory) return { ok: false, face: 'shaper' };
  const bidi = bidiFactory();
  const faces = new Map(
    read.map((each) => {
      const { face, per } = each!;
      const font = new hb.Font(new hb.Face(new hb.Blob(Sfnt.build(face.tables)), 0));
      return [face.id, { face, font, per }] as const;
    }),
  );
  const loaded = (id: string) => {
    const face = faces.get(id);
    if (!face) throw new FaceNotLoaded(id);
    return face;
  };
  const typesetter: Typesetter = {
    face: (id) => loaded(id).face,
    bytes: read.reduce((sum, each) => sum + each!.bytes, 0),
    count: wanted.length,
    split,
    levels: (text, rtl) => levelsBy(bidi, text, rtl),
    shape: ({ face: id, text }, rtl) => {
      const { font, per } = loaded(id);
      const buffer = new hb.Buffer();
      buffer.addText(text);
      buffer.guessSegmentProperties();
      buffer.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
      hb.shape(font, buffer);
      const infos = buffer.getGlyphInfos();
      const positions = buffer.getGlyphPositions();
      // A cluster's characters run from it to the next cluster after it in the text.
      const starts = [...new Set(infos.map((info) => info.cluster))].sort((a, b) => a - b);
      const seen = new Set<number>();
      const glyphs = infos.map((info, at): ShapedGlyph => {
        const position = positions[at]!;
        const first = !seen.has(info.cluster);
        seen.add(info.cluster);
        const end = starts.find((start) => start > info.cluster) ?? text.length;
        return {
          glyph: info.codepoint,
          advance: position.xAdvance * per,
          xOffset: position.xOffset * per,
          yOffset: position.yOffset * per,
          text: first ? text.slice(info.cluster, end) : '',
        };
      });
      return { face: id, glyphs, width: glyphs.reduce((sum, glyph) => sum + glyph.advance, 0) };
    },
  };
  return { ok: true, typesetter };
}
