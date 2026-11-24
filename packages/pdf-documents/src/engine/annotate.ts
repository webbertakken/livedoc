// One mark as its annotation (docs/specs/035-pdf-documents/marks.md "Kinds", "In the file"): each kind as the
// standard's own subtype, with its colour, opacity and author. A line and a shape carry an appearance stream of
// LiveDoc's own, drawn as the page shows them; the engine draws no `Line` that has none.
import {
  PdfArray,
  PdfDict,
  PdfName,
  PdfNumber,
  PdfStream,
  rgb,
  type PDF,
  type PDFAnnotation,
  type PDFPage,
  type PDFTextMarkupAnnotation,
  type TextMarkupAnnotationOptions,
} from '@libpdf/core';
import {
  Mark,
  type Box,
  type LineMark,
  type ShapeMark,
  type Stroke,
  type TextMarkKind,
} from '../mark';
import { MarkDrawing } from '../mark-drawing';
import { APPEARANCE_STATE, appearanceOf, channelOf } from './appearance';

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

/** The annotation drawn as the page shows its mark: the appearance stream as its normal look, its box as its `Rect`. */
function drawAppearance(pdf: PDF, annotation: PDFAnnotation, mark: LineMark | ShapeMark): void {
  const appearance = appearanceOf(MarkDrawing.of(mark), mark);
  const resources = new PdfDict();
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
  annotation.dict.set('AP', PdfDict.of({ N: pdf.register(stream) }));
  // A Rectangle's and an Ellipse's `Rect` is the box grown by half the line: the readers that draw their own draw it
  // inside it.
  if (mark.kind === 'line' || mark.kind === 'arrow')
    annotation.dict.set('Rect', boxArray(appearance.box));
}

/** A Line's, an Arrow's, a Rectangle's or an Ellipse's annotation, as the standard's own subtype. */
function annotateDragged(page: PDFPage, mark: LineMark | ShapeMark, color: ReturnType<typeof rgb>) {
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

/** One mark as its annotation on its page: a text mark as its kind's, a Drawing as `Ink`, a line or shape as its own. */
export function annotate(pdf: PDF, page: PDFPage, mark: Mark): PDFAnnotation {
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
    });
  const annotation =
    mark.kind === 'drawing'
      ? page.addInkAnnotation({ paths: mark.strokes.map(pathOf), color, width: mark.width })
      : annotateDragged(page, mark, color);
  if (mark.kind !== 'drawing') drawAppearance(pdf, annotation, mark);
  annotation.setTitle(mark.author);
  annotation.setOpacity(mark.opacity);
  return annotation;
}
