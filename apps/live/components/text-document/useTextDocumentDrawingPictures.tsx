'use client';

// Drawings' pictures in the writing (docs/specs/034-text-documents/objects.md "Drawn"): each picture naming a drawing
// tab hands its host here (`attach`, given to the pictures' node view), and each is drawn live into its host. Only
// inside an editor: elsewhere the pictures stay their PNGs. The selected picture's bar is useTextDocumentPictureBar's.
import dynamic from 'next/dynamic';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOptionalEditorContext } from '@/app/document/[id]/EditorContext';
import type {
  AttachDrawing,
  DrawingHosts,
} from '@/lib/text-document/text-document-picture-drawing-layer';

const TextDocumentDrawingPicture = dynamic(
  () => import('./TextDocumentDrawingPicture').then((m) => m.TextDocumentDrawingPicture),
  { ssr: false },
);

/** The drawing hosts the pictures hand in, kept as a list the surface renders from. */
export function drawingHostStore() {
  let hosts: readonly (DrawingHosts & { key: string })[] = [];
  let made = 0;
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((l) => l());
  const attach: AttachDrawing = (hosted) => {
    made += 1;
    const entry = { ...hosted, key: String(made) };
    hosts = [...hosts, entry];
    tell();
    return () => {
      hosts = hosts.filter((h) => h !== entry);
      tell();
    };
  };
  return {
    attach,
    hosts: () => hosts,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The drawing hosts the pictures hand in: one store for the surface's life. */
export type DrawingHostStore = ReturnType<typeof drawingHostStore>;

export function useTextDocumentDrawingPictures({ store }: { store: DrawingHostStore }): ReactNode {
  const inEditor = useOptionalEditorContext() !== null;
  const hosts = useSyncExternalStore(store.subscribe, store.hosts, store.hosts);
  const portals = useMemo(
    () =>
      hosts.map((h) =>
        createPortal(
          <TextDocumentDrawingPicture drawingTabId={h.drawingTabId} host={h.drawing} />,
          h.drawing,
          h.key,
        ),
      ),
    [hosts],
  );
  return inEditor ? portals : null;
}
