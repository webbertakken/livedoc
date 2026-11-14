'use client';

import { type ReactNode } from 'react';
import { createStoreContext } from '@/hooks/ui/store-context';

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

// Reached through a store, not a plain context: it sits above the canvas, and a new value would have React walk the
// whole board for its readers (docs/specs/008-canvas/canvas-performance.md "A change above the board walks no
// board").
const EditorLinesContextStore = createStoreContext<EditorLines | null>(null);
export const EditorLinesContext = { Provider: EditorLinesContextStore.Provider };

export function useEditorLines(): EditorLines | null {
  return EditorLinesContextStore.useValue();
}
