'use client';

import { type ReactNode } from 'react';
import { createStoreContext } from '@/hooks/ui/store-context';
import type { EditorModeState } from '@/hooks/editor/useEditorMode';

// The editor's own resolved mode for the active tab (useEditorMode), for the surfaces that carry
// the mode switch: the Toolbar layout's menu button and the Floating layout's Explorer panel
// (docs/specs/007-editor/editor-modes.md "The mode switch"). One resolution, read by all, so
// a switch and the canvas cannot disagree. Null outside a provider (the Explorer page, /new, a
// test that mounts a panel alone), where no switch renders.
// Reached through a store, not a plain context: it sits above the canvas, and a new value would have React walk the
// whole board for its readers (docs/specs/008-canvas/canvas-performance.md "A change above the board walks no
// board").
const EditorModeContextStore = createStoreContext<EditorModeState | null>(null);
const EditorModeContext = { Provider: EditorModeContextStore.Provider };

export function EditorModeProvider({
  value,
  children,
}: {
  value: EditorModeState;
  children: ReactNode;
}) {
  return <EditorModeContext.Provider value={value}>{children}</EditorModeContext.Provider>;
}

export function useEditorModeState(): EditorModeState | null {
  return EditorModeContextStore.useValue();
}
