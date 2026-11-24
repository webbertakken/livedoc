// One mark as its annotation (docs/specs/035-pdf-documents/marks.md "Kinds", "In the file"): each kind as the
// standard's own subtype, with its colour, opacity and author. A line, a shape, a Text, a Callout and a stamp carry
// an appearance stream of LiveDoc's own, drawn as the page shows them: the engine draws no `Line` and no `FreeText`
// that has none, and a stamp is drawn in LiveDoc's style. LibPDF 0.5 has no helper for a `FreeText`, so its dictionary is written here, by the standard.
import {
  PdfArray,
  PdfDict,
  PdfName,
  PdfNumber,
  PdfStream,
  PdfString,
  rgb,
  type PDF,
  type PdfObject,
  type PDFPage,
  type PDFTextMarkupAnnotation,
  type TextMarkupAnnotationOptions,
} from '@libpdf/core';
import {
  Mark,
  type Box,
  type LineMark,
  type ShapeMark,
  type StampMark,
  type Stroke,
  type TextMarkKind,
  type TypedMark,
} from '../mark';
import { MarkDrawing } from '../mark-drawing';
import { MarkWords } from '../mark-words';
import { Stamps } from '../stamps';
import {
  APPEARANCE_BOLD_FONT,
  APPEARANCE_FONT,
  APPEARANCE_STATE,
  appearanceOf,
  channelOf,
  defaultAppearanceOf,
  type Appearance,
  type RunSetter,
} from './appearance';
import type { EmbeddedFaces } from './embedded-faces';

/** How a bake writes words in the mark faces: its typesetter, and the faces it embeds (marks.md "In the file"). */
export type MarkFaceWriting = { readonly setter: RunSetter; readonly faces: EmbeddedFaces };

/** The annotation flag that prints it (marks.md "In the file": the print flag set). */
const PRINT = 4;

/** Each kind of text mark as the writer adds it to a page: the standard's own subtype, with its appearance. */
const ANNOTATE_TEXT = {
  highlight: (page, look) => page.addHighlightAnnotation(look),
  underline: (page, look) => page.addUnderlineAnnotation(look),
  strikeout: (page, look) => page.addStrikeOutAnnotation(look),
  squiggly: (page, look) => page.addSquigglyAnnotation(look),
} satisfies Record<
  TextMarkKind,
  (page: PDFPage, look: TextMarkupAnnotationOptions) => PDFTextMarkupAnnotation
>;

// A stroke's flat x, y pairs as the writer's points.
const pathOf = (stroke: Stroke) =>
  Array.from({ length: stroke.length / 2 }, (_, at) => ({
    x: stroke[at * 2]!,
    y: stroke[at * 2 + 1]!,
  }));

const rectOf = ([left, bottom, right, top]: Box) => ({
  x: left,
  y: bottom,
  width: right - left,
  height: top - bottom,
});

const boxArray = (box: Box): PdfArray => new PdfArray(box.map((n) => PdfNumber.of(n)));

/** Each font an appearance names, as the standard's own face it is. */
const FACES = { [APPEARANCE_FONT]: 'Helvetica', [APPEARANCE_BOLD_FONT]: 'Helvetica-Bold' } as const;

/** An appearance as the stream an annotation's `AP` names: its box, its graphics state, the fonts it sets words in. */
function streamOf(pdf: PDF, appearance: Appearance, writing: MarkFaceWriting | null = null): PdfDict {
  const resources = new PdfDict();
  const standard = appearance.fonts.map((font): [string, PdfObject] => [
    font,
    PdfDict.of({
      Type: PdfName.of('Font'),
      Subtype: PdfName.of('Type1'),
      BaseFont: PdfName.of(FACES[font]),
      Encoding: PdfName.of('WinAnsiEncoding'),
    }),
  ]);
  // An appearance names a mark face only where the bake gave it a typesetter (appearanceOf asks for one).
  const faces = appearance.faces.map(({ name, face, glyphs }): [string, PdfObject] => [
    name,
    writing!.faces.use(face, glyphs),
  ]);
  if (standard.length + faces.length > 0)
    resources.set('Font', PdfDict.of(Object.fromEntries([...standard, ...faces])));
  if (appearance.opacity !== null)
    resources.set(
      'ExtGState',
      PdfDict.of({
        [APPEARANCE_STATE]: PdfDict.of({
          Type: PdfName.of('ExtGState'),
          CA: PdfNumber.of(appearance.opacity),
          ca: PdfNumber.of(appearance.opacity),
        }),
      }),
    );
  const stream = PdfStream.fromDict(
    {
      Type: PdfName.of('XObject'),
      Subtype: PdfName.of('Form'),
      BBox: boxArray(appearance.box),
      Resources: resources,
    },
    new TextEncoder().encode(appearance.content),
  );
  return PdfDict.of({ N: pdf.register(stream) });
}

/** The annotation drawn as the page shows its mark: the appearance stream as its normal look, its box as its `Rect`. */
function drawAppearance(pdf: PDF, annotation: PdfDict, mark: LineMark | ShapeMark): void {
  const appearance = appearanceOf(MarkDrawing.of(mark), mark);
  annotation.set('AP', streamOf(pdf, appearance));
  // A Rectangle's and an Ellipse's `Rect` is the box grown by half the line: the readers that draw their own draw it
  // inside it.
  if (mark.kind === 'line' || mark.kind === 'arrow')
    annotation.set('Rect', boxArray(appearance.box));
}

/**
 * A Text's or a Callout's `FreeText`, added to its page's list: its words as `Contents`, its font as `DA`, its
 * appearance its words as laid out; a Callout's line as `CL` with an open arrowhead at what is meant, `Rect` the
 * box and the line together, and `RD` the box within it.
 */
function annotateTyped(
  pdf: PDF,
  page: PDFPage,
  mark: TypedMark,
  writing: MarkFaceWriting | null,
): PdfDict {
  const appearance = appearanceOf(MarkDrawing.of(mark), mark, MarkWords.of(mark), writing?.setter);
  const dict = PdfDict.of({
    Type: PdfName.of('Annot'),
    Subtype: PdfName.of('FreeText'),
    Rect: boxArray(appearance.box),
    Contents: PdfString.fromString(mark.words),
    DA: PdfString.fromString(defaultAppearanceOf(mark.size, mark.colour)),
    F: PdfNumber.of(PRINT),
    BS: PdfDict.of({ W: PdfNumber.of(mark.kind === 'callout' ? 1 : 0) }),
    AP: streamOf(pdf, appearance, writing),
  });
  if (mark.kind === 'callout') {
    const [left, bottom, right, top] = appearance.box;
    const [boxLeft, boxBottom, boxRight, boxTop] = mark.rect;
    dict.set('IT', PdfName.of('FreeTextCallout'));
    dict.set('CL', new PdfArray(mark.callout.map((n) => PdfNumber.of(n))));
    dict.set('LE', PdfName.of('OpenArrow'));
    dict.set('RD', boxArray([boxLeft - left, boxBottom - bottom, right - boxRight, top - boxTop]));
  }
  const list = page.dict.getArray('Annots');
  if (list) list.push(pdf.register(dict));
  else page.dict.set('Annots', PdfArray.of(pdf.register(dict)));
  return dict;
}

/**
 * A stamp's `Stamp`: `Name` the standard's name for it (or LiveDoc's, or its own id for a stamp LiveDoc does not draw),
 * `Contents` its words a line each, its appearance LiveDoc's style, `Rect` that appearance's box.
 */
function annotateStamp(
  pdf: PDF,
  page: PDFPage,
  mark: StampMark,
  writing: MarkFaceWriting | null,
): PdfDict {
  const appearance = appearanceOf(MarkDrawing.of(mark), mark, MarkWords.of(mark), writing?.setter);
  const dict = page.addStampAnnotation({
    rect: rectOf(appearance.box),
    name: Stamps.of(mark.stamp)?.fileName ?? mark.stamp,
    contents: mark.lines.join('\n'),
  }).dict;
  dict.set('AP', streamOf(pdf, appearance, writing));
  dict.set('C', new PdfArray([1, 3, 5].map((at) => PdfNumber.of(channelOf(mark.colour, at)))));
  return dict;
}

/** A Line's, an Arrow's, a Rectangle's or an Ellipse's annotation, drawn as the page shows it. */
function annotateDragged(
  pdf: PDF,
  page: PDFPage,
  mark: LineMark | ShapeMark,
  color: ReturnType<typeof rgb>,
): PdfDict {
  const annotation = subtypeOf(page, mark, color).dict;
  drawAppearance(pdf, annotation, mark);
  return annotation;
}

/** The annotation as the standard's own subtype for its kind. */
function subtypeOf(page: PDFPage, mark: LineMark | ShapeMark, color: ReturnType<typeof rgb>) {
  if ('line' in mark) {
    const [x1, y1, x2, y2] = mark.line;
    return page.addLineAnnotation({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      color,
      width: mark.width,
      ...(mark.kind === 'arrow' ? { startStyle: 'None', endStyle: 'OpenArrow' } : {}),
    });
  }
  const half = mark.width / 2;
  const [left, bottom, right, top] = mark.rect;
  const look = {
    rect: rectOf([left - half, bottom - half, right + half, top + half]),
    color,
    borderWidth: mark.width,
  };
  return mark.kind === 'rectangle'
    ? page.addSquareAnnotation(look)
    : page.addCircleAnnotation(look);
}

/**
 * One mark as its annotation on its page, answered as its dictionary: a text mark as its kind's, a Drawing as `Ink`, a
 * line or shape as its own, a Text or a Callout as `FreeText`, a stamp as `Stamp`.
 */
export function annotate(
  pdf: PDF,
  page: PDFPage,
  mark: Mark,
  writing: MarkFaceWriting | null = null,
): PdfDict {
  const color = rgb(
    channelOf(mark.colour, 1),
    channelOf(mark.colour, 3),
    channelOf(mark.colour, 5),
  );
  if (Mark.isText(mark))
    return ANNOTATE_TEXT[mark.kind](page, {
      quadPoints: mark.quads.map((quad) => [...quad]),
      color,
      opacity: mark.opacity,
      title: mark.author,
    }).dict;
  const annotation = Mark.isTyped(mark)
    ? annotateTyped(pdf, page, mark, writing)
    : mark.kind === 'stamp'
      ? annotateStamp(pdf, page, mark, writing)
      : mark.kind === 'drawing'
        ? page.addInkAnnotation({ paths: mark.strokes.map(pathOf), color, width: mark.width }).dict
        : annotateDragged(pdf, page, mark, color);
  annotation.set('T', PdfString.fromString(mark.author));
  annotation.set('CA', PdfNumber.of(mark.opacity));
  return annotation;
}
