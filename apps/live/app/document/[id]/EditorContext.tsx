'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useValueStore, useValueStoreSnapshot, type ValueStore } from '@/hooks/ui/useValueStore';
import type { useEditorState } from './useEditorState';

// Derived from the page's orchestration hook so the value type stays in
// lockstep with the provider + consumers, no hand-maintained field list.
type EditorContextValue = ReturnType<typeof useEditorState>;

export type EditorStateStore = ValueStore<EditorContextValue>;

// The editor's state reaches its readers through a store, never as a context value
// (docs/specs/008-canvas/canvas-performance.md "The contexts around the element layer hold still"): the
// state is a new object on every editor render, and a context whose value changed would make React check every
// element view under it for readers.
const EditorStateStoreContext = createContext<EditorStateStore | null>(null);

/** Hands the editor's state to everything below, through one store that keeps its identity. */
export function EditorStateProvider({
  state,
  children,
}: {
  state: EditorContextValue;
  children: ReactNode;
}) {
  const store = useValueStore(state);
  return (
    <EditorStateStoreContext.Provider value={store}>{children}</EditorStateStoreContext.Provider>
  );
}

/** Holds the editor off what is below: there, no component reads an editor (a picker for something else). */
export function OutsideEditor({ children }: { children: ReactNode }) {
  return (
    <EditorStateStoreContext.Provider value={null}>{children}</EditorStateStoreContext.Provider>
  );
}

export function useEditorContext(): EditorContextValue {
  const value = useOptionalEditorContext();
  if (!value) throw new Error('useEditorContext must be used within an EditorStateProvider');
  return value;
}

/** The editor around this component, or null outside one (a surface mounted on its own). */
export function useOptionalEditorContext(): EditorContextValue | null {
  return useValueStoreSnapshot(useContext(EditorStateStoreContext));
}

/** The store itself, for a test that pins its identity. */
export function useEditorStateStore(): EditorStateStore | null {
  return useContext(EditorStateStoreContext);
}
