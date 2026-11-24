// The picture of a PDF's first page as a JPEG (docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's
// thumbnail": "What is drawn"): the page as the engine drew it, on white, with the live marks over it as the
// surface draws them (PdfMarksOverlay.tsx: each mark as MarkDrawing says, multiplied onto the page). Always light paper: nothing of Dark
// pages, of what a person holds or of anyone's presence is ever drawn here. The browser's canvas does the work, so
// this half is proven in a browser (e2e/office/pdf-document-thumbnail.spec.ts), never in jsdom.
import { MarkDrawing, PageView, type PageMatrix, type PagePoint } from '@livedoc/pdf-documents';
import type { PdfThumbnailPicture } from './pdf-thumbnail';

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

export async function encodePdfThumbnail(
  { bitmap, marks, page: size }: PdfThumbnailPicture,
  quality: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
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
    const { fills, strokes } = MarkDrawing.of(mark);
    context.fillStyle = mark.colour;
    context.strokeStyle = mark.colour;
    context.globalAlpha = mark.opacity;
    for (const points of fills) {
      trace(context, bitmap.toView, points);
      context.closePath();
      context.fill();
    }
    for (const stroke of strokes) {
      trace(context, bitmap.toView, stroke.points);
      if (stroke.closed) context.closePath();
      context.lineWidth = stroke.width;
      context.lineCap = stroke.round ? 'round' : 'butt';
      context.lineJoin = stroke.round ? 'round' : 'miter';
      context.stroke();
    }
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
