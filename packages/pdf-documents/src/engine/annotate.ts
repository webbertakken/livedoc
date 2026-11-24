// One mark as its annotation (docs/specs/035-pdf-documents/marks.md "Kinds", "In the file"): each kind as the
// standard's own subtype, with its colour, opacity and author. A line, a shape, a Text and a Callout carry an
// appearance stream of LiveDoc's own, drawn as the page shows them: the engine draws no `Line` and no `FreeText` that
// has none. LibPDF 0.5 has no helper for a `FreeText`, so its dictionary is written here, by the standard.
import {
  PdfArray,
  PdfDict,
  PdfName,
  PdfNumber,
  PdfStream,
  PdfString,
  rgb,
  type PDF,
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
  type TypedMark,
} from '../mark';
import { MarkDrawing } from '../mark-drawing';
import { TypedLayout } from '../typed-layout';
import {
  APPEARANCE_FONT,
  APPEARANCE_STATE,
  appearanceOf,
  channelOf,
  defaultAppearanceOf,
  type Appearance,
} from './appearance';

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

/** An appearance as the stream an annotation's `AP` names: its box, its graphics state, its font where it sets words. */
function streamOf(pdf: PDF, appearance: Appearance, words: boolean): PdfDict {
  const resources = new PdfDict();
  if (words)
    resources.set(
      'Font',
      PdfDict.of({
        [APPEARANCE_FONT]: PdfDict.of({
          Type: PdfName.of('Font'),
          Subtype: PdfName.of('Type1'),
          BaseFont: PdfName.of('Helvetica'),
          Encoding: PdfName.of('WinAnsiEncoding'),
        }),
      }),
    );
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
  annotation.set('AP', streamOf(pdf, appearance, false));
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
function annotateTyped(pdf: PDF, page: PDFPage, mark: TypedMark): PdfDict {
  const words = { lines: TypedLayout.place(mark), size: mark.size, box: mark.rect };
  const appearance = appearanceOf(MarkDrawing.of(mark), mark, words);
  const dict = PdfDict.of({
    Type: PdfName.of('Annot'),
    Subtype: PdfName.of('FreeText'),
    Rect: boxArray(appearance.box),
    Contents: PdfString.fromString(mark.words),
    DA: PdfString.fromString(defaultAppearanceOf(mark.size, mark.colour)),
    F: PdfNumber.of(PRINT),
    BS: PdfDict.of({ W: PdfNumber.of(mark.kind === 'callout' ? 1 : 0) }),
    AP: streamOf(pdf, appearance, true),
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

/**
 * One mark as its annotation on its page, answered as its dictionary: a text mark as its kind's, a Drawing as `Ink`, a
 * line or shape as its own, a Text or a Callout as `FreeText`.
 */
export function annotate(pdf: PDF, page: PDFPage, mark: Mark): PdfDict {
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
    ? annotateTyped(pdf, page, mark)
    : mark.kind === 'drawing'
      ? page.addInkAnnotation({ paths: mark.strokes.map(pathOf), color, width: mark.width }).dict
      : annotateDragged(page, mark, color).dict;
  if (mark.kind !== 'drawing' && !Mark.isTyped(mark)) drawAppearance(pdf, annotation, mark);
  annotation.set('T', PdfString.fromString(mark.author));
  annotation.set('CA', PdfNumber.of(mark.opacity));
  return annotation;
}
