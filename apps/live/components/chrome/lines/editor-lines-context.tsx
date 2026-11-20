'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useValueStore, useValueStoreSnapshot, type ValueStore } from '@/hooks/ui/useValueStore';

// What the editor page hands the canvas chrome for its two lines (docs/specs/007-editor/toolbar-layout.md):
// the actions group and the document group, built where their state lives (the page), placed where the lines are
// measured (CanvasChrome), so no group's props run through the canvas. Null outside the editor page (an embed, a
// test), where the chrome draws neither group; either node is null where its group is not drawn.
export type EditorLines = {
  actions: ReactNode;
  document: ReactNode;
  // A share-code embed (docs/specs/013-workspace/embeds.md): its Open in LiveDoc badge holds the bottom-left corner, so
  // the tools group (its zoom controls) keeps the bottom right.
  embed?: boolean;
};

// The groups are new on every editor render, and this context sits around the canvas: they travel in a store, so
// the context holds still (docs/specs/008-canvas/canvas-performance.md "The contexts around the element layer hold
// still") and only the chrome that draws them re-renders.
const EditorLinesContext = createContext<ValueStore<EditorLines> | null>(null);

export function EditorLinesProvider({
  lines,
  children,
}: {
  lines: EditorLines;
  children: ReactNode;
}) {
  const store = useValueStore(lines);
  return <EditorLinesContext.Provider value={store}>{children}</EditorLinesContext.Provider>;
}

export function useEditorLines(): EditorLines | null {
  return useValueStoreSnapshot(useContext(EditorLinesContext));
}
