// The picture of a PDF's first page as a JPEG (docs/specs/035-pdf-documents/live-editing-and-storage.md "A browser's
// thumbnail": "What is drawn"): the page as the engine drew it, on white, with the live marks over it as the
// surface draws them (PdfPage.tsx: each mark's quads, multiplied onto the page). Always light paper: nothing of Dark
// pages, of what a person holds or of anyone's presence is ever drawn here. The browser's canvas does the work, so
// this half is proven in a browser (e2e/office/pdf-document-thumbnail.spec.ts), never in jsdom.
import { PageView } from '@livedoc/pdf-documents';
import type { PdfThumbnailPicture } from './pdf-thumbnail';

// The standard orders a quad upper left, upper right, lower left, lower right: around its edge is 0, 1, 3, 2.
const AROUND = [0, 1, 3, 2] as const;

export async function encodePdfThumbnail(
  { bitmap, marks }: PdfThumbnailPicture,
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
  context.globalCompositeOperation = 'multiply';
  for (const mark of marks) {
    context.fillStyle = mark.colour;
    context.globalAlpha = mark.opacity;
    for (const quad of mark.quads) {
      const corners = PageView.quadToView(bitmap.toView, quad);
      context.beginPath();
      AROUND.forEach((corner, at) => {
        const { x, y } = corners[corner]!;
        if (at === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fill();
    }
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
