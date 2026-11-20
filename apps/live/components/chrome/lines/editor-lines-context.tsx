'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { OfficeChrome } from '@/components/office/office-chrome';

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
  // The office title row's document parts, for a surface (docs/specs/004-interface-design/office-shell.md "Title row").
  office?: OfficeChrome | null;
};

export const EditorLinesContext = createContext<EditorLines | null>(null);

export function useEditorLines(): EditorLines | null {
  return useContext(EditorLinesContext);
}
