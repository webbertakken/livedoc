// The picture of a PDF's first page as a JPEG (docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's
// thumbnail": "What is drawn"): the page as the engine drew it, on white, with the live marks over it as the
// surface draws them (PdfMarksOverlay.tsx: each mark as MarkDrawing says, multiplied onto the page). Always light paper: nothing of Dark
// pages, of what a person holds or of anyone's presence is ever drawn here. The browser's canvas does the work, so
// this half is proven in a browser (e2e/office/pdf-document-thumbnail.spec.ts), never in jsdom.
import {
  MarkDrawing,
  MarkTurn,
  MarkWords,
  PageView,
  type Mark,
  type PageMatrix,
  type PagePoint,
} from '@livedoc/pdf-documents';
import type { PdfThumbnailPicture } from './pdf-thumbnail';
import { debugLog } from '@/lib/debug-log';
import { addMarkFaces, addMarkFont, facesStackOf } from './pdf-mark-faces';

// A path through points of page space, in the picture's points.
function trace(
  context: CanvasRenderingContext2D,
  toView: PageMatrix,
  points: readonly PagePoint[],
) {
  context.beginPath();
  points.forEach((point, at) => {
    const { x, y } = PageView.toView(toView, point);
    if (at === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
}

/** A line's font as a canvas names it. */
const fontOf = (
  line: { bold: boolean; size: number },
  words: Pick<MarkWords, 'faces' | 'region' | 'font'>,
): string => `${line.bold ? 'bold ' : ''}${line.size}px ${facesStackOf(words)}`;

/**
 * The mark faces a picture's marks are drawn in, loaded first: a canvas draws in a face only once it has arrived
 * (marks.md "Laying out").
 */
async function loadMarkFaces(marks: readonly Mark[]): Promise<void> {
  const lines = marks.flatMap((mark) => {
    const words = MarkWords.of(mark);
    return words?.faces === 'embedded' ? words.lines.map((line) => ({ line, words })) : [];
  });
  if (lines.length === 0) return;
  for (const font of new Set(lines.map(({ words }) => words.font))) if (font) addMarkFont(font);
  await Promise.all(
    [...new Set(lines.map(({ words }) => words.region))].map((region) => addMarkFaces(region)),
  );
  try {
    await Promise.all(
      lines.map(({ line, words }) => document.fonts.load(fontOf(line, words), line.text)),
    );
  } catch {
    // Drawn in the browser's own faces, as the surface is until they arrive.
    debugLog('[pdf] faces-failed face=picture');
  }
}

/** A mark's words, each line from its baseline along the page's own across, as the overlay sets them. */
function setWords(context: CanvasRenderingContext2D, toView: PageMatrix, mark: Mark) {
  const [a, b, c, d] = toView;
  const words = MarkWords.of(mark);
  for (const line of words?.lines ?? []) {
    context.font = fontOf(line, words!);
    const start = PageView.toView(toView, {
      x: line.rtl ? line.x + line.width : line.x,
      y: line.y,
    });
    context.save();
    context.transform(a, b, -c, -d, start.x, start.y);
    context.direction = line.rtl ? 'rtl' : 'ltr';
    context.fillText(line.text, 0, 0);
    context.restore();
  }
}

export async function encodePdfThumbnail(
  { bitmap, marks, page: size }: PdfThumbnailPicture,
  quality: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  await loadMarkFaces(marks);
  const page = document.createElement('canvas');
  page.width = bitmap.width;
  page.height = bitmap.height;
  page
    .getContext('2d')
    ?.putImageData(new ImageData(bitmap.rgba, bitmap.width, bitmap.height), 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  // White under the page: a JPEG has no transparency, and the paper is light.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(page, 0, 0);
  // Marks are placed in the page's points, as the surface's own overlay is (its viewBox is the page's size): the
  // picture's pixels are those points at the scale the page was drawn at.
  context.scale(bitmap.width / size.width, bitmap.height / size.height);
  context.globalCompositeOperation = 'multiply';
  for (const mark of marks) {
    const { fills, strokes, fill } = MarkDrawing.of(mark);
    // A turned mark is drawn upright, turned into place (marks.md "Changing a mark": Rotate).
    const toView = MarkTurn.drawnIn(bitmap.toView, mark);
    context.globalAlpha = mark.opacity;
    // A shape's fill in its own colour, under its line.
    if (fill) {
      context.fillStyle = fill.colour;
      trace(context, toView, fill.points);
      context.closePath();
      context.fill();
    }
    context.fillStyle = mark.colour;
    context.strokeStyle = mark.colour;
    for (const points of fills) {
      trace(context, toView, points);
      context.closePath();
      context.fill();
    }
    for (const stroke of strokes) {
      trace(context, toView, stroke.points);
      if (stroke.closed) context.closePath();
      context.lineWidth = stroke.width;
      context.lineCap = stroke.round ? 'round' : 'butt';
      context.lineJoin = stroke.round ? 'round' : 'miter';
      context.setLineDash(stroke.dash ?? []);
      context.stroke();
    }
    setWords(context, toView, mark);
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
