'use client';

import { createStoreContext } from '@/hooks/ui/store-context';
import type { useEditorState } from './useEditorState';

// Derived from the page's orchestration hook so the value type stays in
// lockstep with the provider + consumers, no hand-maintained field list.
type EditorContextValue = ReturnType<typeof useEditorState>;

// The editor's state is new on every editor render and sits above the canvas, so it reaches its readers through a
// store: a context would have React walk the whole board for them on each render
// (docs/specs/008-canvas/canvas-performance.md "A change above the board walks no board").
const EditorStore = createStoreContext<EditorContextValue | null>(null);

export const EditorContext = { Provider: EditorStore.Provider };

export function useEditorContext(): EditorContextValue {
  const value = EditorStore.useValue();
  if (!value) throw new Error('useEditorContext must be used within an EditorContext.Provider');
  return value;
}

/** The editor around this component, or null outside one (a surface mounted on its own). */
export function useOptionalEditorContext(): EditorContextValue | null {
  return EditorStore.useValue();
}
