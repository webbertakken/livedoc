'use client';

// Drawings' pictures in the writing (docs/specs/034-text-documents/objects.md "Drawn", "The picture's bar"): each
// picture naming a drawing tab hands its hosts here (`attach`, given to the pictures' node view), and each is drawn live
// into its host; the selected one's bar (Edit, or Open) is drawn under it. Only inside an editor: elsewhere the
// pictures stay their PNGs.
import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useOptionalEditorContext } from '@/app/document/[id]/EditorContext';
import { drawingOfPicture } from '@/lib/text-document/text-document-drawing-pictures';
import {
  PICTURE_BAR_CLASS,
  type AttachDrawing,
  type DrawingHosts,
} from '@/lib/text-document/text-document-picture-drawing-layer';
import type { OpenDrawing } from '@/lib/text-document/text-document-drawing-open-plugin';
import { TextDocumentPictureBar } from './TextDocumentPictureBar';

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

/** The selected drawing's picture: where it is, its drawing tab and its bar host. */
type SelectedDrawing = { pos: number; drawingTabId: string; bar: HTMLElement | null };

function selectedIn(view: EditorView): SelectedDrawing | null {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection)) return null;
  const drawingTabId = drawingOfPicture(selection.node);
  if (!drawingTabId) return null;
  const dom = view.nodeDOM(selection.from);
  return {
    pos: selection.from,
    drawingTabId,
    bar:
      dom instanceof HTMLElement ? dom.querySelector<HTMLElement>(`.${PICTURE_BAR_CLASS}`) : null,
  };
}

const same = (a: SelectedDrawing | null, b: SelectedDrawing | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.pos === b.pos &&
    a.drawingTabId === b.drawingTabId &&
    a.bar === b.bar);

/** The drawing hosts the pictures hand in: one store for the surface's life. */
export type DrawingHostStore = ReturnType<typeof drawingHostStore>;

export function useTextDocumentDrawingPictures({
  store,
  view,
  canEdit,
  subscribe,
  open,
  opens,
}: {
  store: DrawingHostStore;
  view: EditorView | null;
  canEdit: boolean;
  // Told when the caret moves or the writing changes.
  subscribe: (listener: () => void) => () => void;
  // Opens a drawing from its picture; null where none may be opened. Whether one is there to open: its bar shows then.
  open: OpenDrawing | null;
  opens: (drawingTabId: string) => boolean;
}): ReactNode {
  const inEditor = useOptionalEditorContext() !== null;
  const hosts = useSyncExternalStore(store.subscribe, store.hosts, store.hosts);

  const [selected, setSelected] = useState<SelectedDrawing | null>(null);
  useEffect(() => {
    if (!view) return;
    const update = () => {
      if (view.isDestroyed) return;
      const now = selectedIn(view);
      setSelected((was) => (same(was, now) ? was : now));
    };
    update();
    return subscribe(update);
  }, [view, subscribe]);

  const back = useCallback(() => view?.focus(), [view]);
  const portals = useMemo(
    () => (
      <>
        {hosts.map((h) =>
          createPortal(
            <TextDocumentDrawingPicture drawingTabId={h.drawingTabId} host={h.drawing} />,
            h.drawing,
            h.key,
          ),
        )}
        {open && selected?.bar && opens(selected.drawingTabId)
          ? createPortal(
              <TextDocumentPictureBar
                canEdit={canEdit}
                onOpen={() => open(selected.drawingTabId, selected.pos)}
                onBack={back}
              />,
              selected.bar,
            )
          : null}
      </>
    ),
    [hosts, open, opens, selected, canEdit, back],
  );

  return inEditor ? portals : null;
}
