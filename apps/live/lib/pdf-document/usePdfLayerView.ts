'use client';

// One person's PDF layers (docs/specs/035-pdf-documents/reading-surface.md "Layers"): which layers they hide, kept
// while the surface is open, and the drawer their pages, tiles and thumbnails are drawn with. Null hides nothing of
// the file's own: the layers are as the file sets them, drawn by the surface's own drawer. Another set of layers is
// another drawer, so everything drawn with the earlier one is drawn again; the browser's thumbnail, a download and a
// print never pass through here.
import { useCallback, useMemo, useState } from 'react';
import type { PdfEngine } from '@livedoc/pdf-documents';
import { track } from '@/lib/telemetry';
import { pdfPageDrawer, type PdfPageDrawer } from './pdf-page-drawer';

export type PdfLayerView = {
  /** The layers hidden for this person, by id; null while they are as the file sets them. */
  hidden: readonly string[] | null;
  /** What the pages are drawn with now; null while there is no file to draw. */
  drawer: PdfPageDrawer | null;
  /**
   * Shows or hides one layer, the others as `hidden` says; false where the engine cannot draw them so, and nothing
   * changes.
   */
  setLayer: (id: string, shown: boolean, hidden: readonly string[]) => Promise<boolean>;
};

export function usePdfLayerView(
  engine: Pick<PdfEngine, 'drawPage' | 'drawTile' | 'layerView'> | null,
  fileDrawer: PdfPageDrawer | null,
): PdfLayerView {
  const [hidden, setHidden] = useState<readonly string[] | null>(null);
  const drawer = useMemo(
    () =>
      hidden === null || !engine
        ? fileDrawer
        : pdfPageDrawer({
            drawPage: (index, scale, turns) => engine.drawPage(index, scale, turns, hidden),
            drawTile: (index, scale, turns, rect) =>
              engine.drawTile(index, scale, turns, rect, hidden),
          }),
    [hidden, engine, fileDrawer],
  );
  const setLayer = useCallback(
    async (id: string, shown: boolean, before: readonly string[]) => {
      const next = shown ? before.filter((other) => other !== id) : [...new Set([...before, id])];
      if (!engine || !(await engine.layerView(next))) return false;
      track('Pdf', 'Toggled', shown ? 'Layer.Shown' : 'Layer.Hidden');
      setHidden(next);
      return true;
    },
    [engine],
  );
  return { hidden, drawer, setLayer };
}
