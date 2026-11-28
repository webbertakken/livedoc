// Laid-out pages written as a PDF (docs/specs/035-pdf-documents/files-print-and-sync.md "One writer"; plan 0019
// blueprint "PR 14f1"): what a kind drew on its pages, as the repository's one PDF writer writes it. Text as text, each
// run shaped in its own font, embedded once and subset, and fitted to the width it was drawn at, so the PDF's words
// stand where the page's stood; fills, lines and pictures; links; the outline from the headings; tagged. It parses
// nothing of anyone's: what it is handed is LiveDoc's own drawing. Loaded where a PDF is asked for, never before.
import {
  PDF,
  PdfArray,
  PdfDict,
  PdfName,
  PdfNumber,
  PdfStream,
  PdfString,
  type PdfRef,
} from '@libpdf/core';
import type { MarkRun } from '../mark-faces';
import { PDF_MAX_PAGE_POINTS, PDF_PROPERTY_MAX_CHARS } from '../limits';
import { num, rgbOf, shownRun, type RunSetter } from './appearance';
import { inVisualOrder } from './bidi-order';
import { embeddedFaces } from './embedded-faces';
import { readFaces, runsIn, type LaidOutFace, type ReadFaces } from './laid-out-faces';
import {
  Marked,
  destinationOf,
  markedItems,
  writeOutline,
  writeStructure,
  type LaidOutHeading,
  type LaidOutTag,
} from './laid-out-structure';
import { loadTypesetter, type MarkFaceSource, type ShapedRun, type Typesetter } from './typesetter';

export type { LaidOutFace } from './laid-out-faces';
export type { LaidOutHeading, LaidOutItemRef, LaidOutRole, LaidOutTag } from './laid-out-structure';
export { PDF_MAX_PAGE_POINTS } from '../limits';

/** A colour as `#rrggbb`. */
type Colour = string;

/** A fill: a page's colour, a shading, a highlight, a cell's fill. Points, from the page's top left. */
export type LaidOutBox = {
  readonly kind: 'box';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly colour: Colour;
  readonly opacity?: number;
};

/** A straight line: a border, a rule, an underline, a strike. */
export type LaidOutLine = {
  readonly kind: 'line';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly colour: Colour;
  readonly dash?: 'dashed' | 'dotted';
};

/**
 * Words drawn in one font, size and colour, from `x` at their baseline. `text` may end in white space, written but not
 * fitted; `width` is how wide the rest was drawn.
 */
export type LaidOutText = {
  readonly kind: 'text';
  readonly x: number;
  readonly baseline: number;
  readonly width: number;
  readonly text: string;
  /** A face of the document's `faces`, by id. */
  readonly face: string;
  readonly size: number;
  readonly colour: Colour;
  /** It reads right to left. */
  readonly rtl?: boolean;
};

export type LaidOutPicture = {
  readonly kind: 'picture';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
  readonly format: 'png' | 'jpeg';
  readonly opacity?: number;
};

/** Where a link leads: a web address, or a place in these pages (its top in points from the page's top). */
export type LaidOutLinkTarget =
  { readonly uri: string } | { readonly page: number; readonly top: number };

export type LaidOutLink = {
  readonly kind: 'link';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly to: LaidOutLinkTarget;
};

export type LaidOutItem = LaidOutBox | LaidOutLine | LaidOutText | LaidOutPicture | LaidOutLink;

/** A page: its size in points and what is drawn on it, in order. */
export type LaidOutPage = {
  readonly width: number;
  readonly height: number;
  readonly items: readonly LaidOutItem[];
};

export type LaidOutDocument = {
  readonly title: string;
  /** Its language, BCP 47; `en` where none is said. */
  readonly language?: string;
  readonly created: Date;
  readonly faces: readonly LaidOutFace[];
  readonly pages: readonly LaidOutPage[];
  readonly outline: readonly LaidOutHeading[];
  readonly tags: readonly LaidOutTag[];
};

/** Why laid-out pages are not a PDF: no page, a page past the most a PDF page measures, no shaper. */
export type LaidOutRefusal = 'no_pages' | 'page_size' | 'face';

export type LaidOutWritten =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array<ArrayBuffer>;
      /** Glyphs no face held, drawn as the missing box. */
      readonly missing: number;
      /** Face files that did not load, their words set in the mark faces. */
      readonly facesFailed: number;
      /** Links to anything but the web, mail or these pages, left out. */
      readonly droppedLinks: number;
    }
  | { readonly ok: false; readonly refusal: LaidOutRefusal };

/** A run is scaled across to its drawn width where its own width is further from it than this, in points. */
export const LAID_OUT_FIT_PT = 0.25;
/** The most a run is scaled across, either way, in percent. */
export const LAID_OUT_FIT_RANGE = [50, 200] as const;

const PRODUCER = 'LiveDoc';
const glyphClusters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const SAFE_URI = /^(https?:|mailto:)/i;

function refusalOf(pages: readonly LaidOutPage[]): LaidOutRefusal | null {
  if (pages.length === 0) return 'no_pages';
  const bad = (n: number) => !Number.isFinite(n) || n <= 0 || n > PDF_MAX_PAGE_POINTS;
  return pages.some((page) => bad(page.width) || bad(page.height)) ? 'page_size' : null;
}

async function deflated(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const packed = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(packed).arrayBuffer());
}

/** A text item's runs: what is fitted, and the white space after it. */
type TextRuns = { readonly body: readonly MarkRun[]; readonly tail: readonly MarkRun[] };

function textRunsOf(item: LaidOutText, faces: ReadFaces): TextRuns {
  const body = item.text.trimEnd();
  const tail = item.rtl ? '' : item.text.slice(body.length);
  return { body: runsIn(body, item.face, faces), tail: tail ? runsIn(tail, item.face, faces) : [] };
}

/** One page's resources as the content names them. */
type Resources = {
  readonly font: (face: string, run: ShapedRun) => string;
  readonly picture: (item: LaidOutPicture) => string;
  readonly state: (opacity: number) => string;
};

function textContent(
  item: LaidOutText,
  runs: TextRuns,
  typesetter: Typesetter,
  setter: RunSetter,
  resources: Resources,
  height: number,
): string[] {
  const shape = (all: readonly MarkRun[], text: string) => {
    const split = all.flatMap(typesetter.split);
    return inVisualOrder(split, typesetter.levels(text, item.rtl === true)).map(
      ({ face, text: part, level }) => typesetter.shape({ face, text: part }, level % 2 === 1),
    );
  };
  const body = shape(runs.body, runs.body.map((run) => run.text).join(''));
  const tail = shape(runs.tail, runs.tail.map((run) => run.text).join(''));
  const drawn = (body.reduce((sum, run) => sum + run.width, 0) * item.size) / 1000;
  // One character (a bullet, a symbol) keeps its shape, centred in its width: scaling it across would distort it.
  const single = [...glyphClusters.segment(runs.body.map((run) => run.text).join(''))].length === 1;
  const fits = !single && drawn > 0 && Math.abs(drawn - item.width) > LAID_OUT_FIT_PT;
  const [least, most] = LAID_OUT_FIT_RANGE;
  const scale = fits ? Math.min(most, Math.max(least, (item.width / drawn) * 100)) : 100;
  const x = single ? item.x + (item.width - drawn) / 2 : item.x;
  const out = [
    'BT',
    `${rgbOf(item.colour)} rg`,
    `${num(scale)} Tz`,
    `1 0 0 1 ${num(x)} ${num(height - item.baseline)} Tm`,
  ];
  for (const run of [...body, ...tail]) {
    out.push(
      `/${resources.font(run.face, run)} ${num(item.size)} Tf`,
      ...shownRun(run, item.size, setter),
    );
  }
  out.push('ET');
  return out;
}

function itemContent(
  item: Exclude<LaidOutItem, LaidOutLink>,
  height: number,
  resources: Resources,
  text: (item: LaidOutText) => string[],
): string[] {
  switch (item.kind) {
    case 'box': {
      const state =
        item.opacity !== undefined && item.opacity < 1
          ? [`/${resources.state(item.opacity)} gs`]
          : [];
      const y = height - item.y - item.height;
      return [
        'q',
        ...state,
        `${rgbOf(item.colour)} rg`,
        `${num(item.x)} ${num(y)} ${num(item.width)} ${num(item.height)} re f`,
        'Q',
      ];
    }
    case 'line': {
      const dash =
        item.dash === 'dashed'
          ? `[${num(item.width * 3)} ${num(item.width * 2)}] 0 d`
          : item.dash === 'dotted'
            ? `1 J [0 ${num(item.width * 2)}] 0 d`
            : '[] 0 d';
      return [
        'q',
        `${num(item.width)} w ${dash}`,
        `${rgbOf(item.colour)} RG`,
        `${num(item.x1)} ${num(height - item.y1)} m ${num(item.x2)} ${num(height - item.y2)} l S`,
        'Q',
      ];
    }
    case 'picture': {
      const state =
        item.opacity !== undefined && item.opacity < 1
          ? [`/${resources.state(item.opacity)} gs`]
          : [];
      const y = height - item.y - item.height;
      return [
        'q',
        ...state,
        `${num(item.width)} 0 0 ${num(item.height)} ${num(item.x)} ${num(y)} cm`,
        `/${resources.picture(item)} Do`,
        'Q',
      ];
    }
    case 'text':
      return text(item);
  }
}

/** The pages written as a PDF; `faces` answers each face's files, as the mark faces' source does. */
export async function writeLaidOutPages(
  document: LaidOutDocument,
  faces: MarkFaceSource,
): Promise<LaidOutWritten> {
  const refusal = refusalOf(document.pages);
  if (refusal) return { ok: false, refusal };
  const read = await readFaces(document.faces, faces);
  const textRuns = new Map<LaidOutText, TextRuns>();
  for (const page of document.pages)
    for (const item of page.items)
      if (item.kind === 'text') textRuns.set(item, textRunsOf(item, read));
  const allRuns = [...textRuns.values()].flatMap(({ body, tail }) => [...body, ...tail]);
  const loaded = await loadTypesetter(allRuns, faces, read.files);
  if (!loaded.ok) return { ok: false, refusal: 'face' };
  const { typesetter } = loaded;
  const setter: RunSetter = {
    shape: typesetter.shape,
    // Only glyphs shaped in a face are asked of it, so each has its advance.
    advance: (face, glyph) => typesetter.face(face).advances[glyph]!,
    levels: typesetter.levels,
    split: typesetter.split,
  };

  const pdf = PDF.create();
  const at = document.created;
  pdf.setTitle(document.title.slice(0, PDF_PROPERTY_MAX_CHARS), { showInWindowTitleBar: true });
  pdf.setAuthor('');
  pdf.setProducer(PRODUCER);
  pdf.setCreator(PRODUCER);
  pdf.setCreationDate(at);
  pdf.setModificationDate(at);
  pdf.setLanguage(document.language ?? 'en');

  const fonts = embeddedFaces(pdf, typesetter);
  const isLink = (page: number, index: number) =>
    document.pages[page]?.items[index]?.kind === 'link';
  const marked = markedItems(document.tags, isLink);
  const states = new Map<number, PdfRef>();
  const pages = document.pages.map((page) => {
    const made = pdf.addPage({ width: page.width, height: page.height });
    return { page: made, ref: made.ref, height: page.height };
  });
  const links = new Map<string, { dict: PdfDict; ref: PdfRef }>();
  let droppedLinks = 0;

  for (const [index, page] of document.pages.entries()) {
    const fontNames = new Map<string, string>();
    const fontDict = PdfDict.of({});
    const pictureDict = PdfDict.of({});
    const stateDict = PdfDict.of({});
    let pictures = 0;
    const resources: Resources = {
      font: (face, run) => {
        const ref = fonts.use(face, run.glyphs);
        let name = fontNames.get(face);
        if (!name) {
          name = `F${fontNames.size}`;
          fontNames.set(face, name);
          fontDict.set(name, ref);
        }
        return name;
      },
      picture: (item) => {
        const image = item.format === 'jpeg' ? pdf.embedJpeg(item.bytes) : pdf.embedPng(item.bytes);
        const name = `Im${pictures}`;
        pictures += 1;
        pictureDict.set(name, image.ref);
        return name;
      },
      state: (opacity) => {
        const key = Math.round(Math.min(1, Math.max(0, opacity)) * 1000) / 1000;
        const name = `GS${Math.round(key * 1000)}`;
        let ref = states.get(key);
        if (!ref) {
          ref = pdf.register(
            PdfDict.of({
              Type: PdfName.of('ExtGState'),
              ca: PdfNumber.of(key),
              CA: PdfNumber.of(key),
            }),
          );
          states.set(key, ref);
        }
        stateDict.set(name, ref);
        return name;
      },
    };
    const content: string[] = [];
    const annotations: PdfRef[] = [];
    for (const [itemIndex, item] of page.items.entries()) {
      if (item.kind === 'link') {
        const target = linkTarget(item.to, pages);
        if (!target) {
          droppedLinks += 1;
          continue;
        }
        const dict = PdfDict.of({
          Type: PdfName.of('Annot'),
          Subtype: PdfName.of('Link'),
          Rect: PdfArray.of(
            PdfNumber.of(item.x),
            PdfNumber.of(page.height - item.y - item.height),
            PdfNumber.of(item.x + item.width),
            PdfNumber.of(page.height - item.y),
          ),
          Border: PdfArray.of(PdfNumber.of(0), PdfNumber.of(0), PdfNumber.of(0)),
          P: pages[index]!.ref,
          ...target,
        });
        const ref = pdf.register(dict);
        annotations.push(ref);
        links.set(Marked.keyOf(index, itemIndex), { dict, ref });
        continue;
      }
      const drawn = itemContent(item, page.height, resources, (text) =>
        textContent(text, textRuns.get(text)!, typesetter, setter, resources, page.height),
      );
      const mark = marked.get(Marked.keyOf(index, itemIndex));
      content.push(
        mark ? `/${mark.role} <</MCID ${mark.mcid}>> BDC` : '/Artifact BMC',
        ...drawn,
        'EMC',
      );
    }
    const made = pages[index]!.page;
    const stream = PdfStream.fromDict(
      { Filter: PdfName.of('FlateDecode') },
      await deflated(new TextEncoder().encode(content.join('\n'))),
    );
    made.dict.set('Contents', pdf.register(stream));
    made.dict.set(
      'Resources',
      PdfDict.of({ Font: fontDict, XObject: pictureDict, ExtGState: stateDict }),
    );
    made.dict.set('StructParents', PdfNumber.of(index));
    made.dict.set('Tabs', PdfName.of('S'));
    if (annotations.length > 0) made.dict.set('Annots', new PdfArray(annotations));
  }

  const { missing } = fonts.finish();
  const written = { pages, links, marked };
  writeOutline(pdf, document.outline, pages);
  writeStructure(pdf, document.tags, written);
  return {
    ok: true,
    bytes: (await pdf.save()) as Uint8Array<ArrayBuffer>,
    missing,
    facesFailed: read.failed,
    droppedLinks,
  };
}

/** A link's action or destination; null for anything but the web, mail or a place in these pages. */
function linkTarget(
  to: LaidOutLinkTarget,
  pages: readonly { readonly ref: PdfRef; readonly height: number }[],
): Record<string, PdfDict | PdfArray> | null {
  if ('uri' in to) {
    if (!SAFE_URI.test(to.uri)) return null;
    return {
      A: PdfDict.of({ S: PdfName.of('URI'), URI: PdfString.fromString(to.uri) }),
    };
  }
  const page = pages[to.page];
  return page ? { Dest: destinationOf(page.ref, page.height - to.top) } : null;
}

/** The mark faces' files, fetched as the app's own assets: the fallback faces a page's words need. */
export { fetchMarkFace } from './fetch-mark-face';
