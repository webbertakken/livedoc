// The editor's code, fetched once and kept (docs/specs/013-workspace/new-document-menu.md "In the
// Explorer's place"): /new and the Explorer fetch it ahead of the moment they hand a document to it, and the Explorer
// renders the loaded component directly, so opening never waits on a lazy component suspending.
import type { ComponentType } from 'react';
import type { EditorSurface } from '@/app/document/[id]/editor-surface';

export type EditorPageComponent = ComponentType<{ surface?: EditorSurface }>;

let loaded: EditorPageComponent | null = null;
let loading: Promise<EditorPageComponent> | null = null;

export function loadEditorPage(): Promise<EditorPageComponent> {
  loading ??= import('@/app/document/[id]/editor-page').then(
    (m) => (loaded = m.default),
    (err: unknown) => {
      // A failed fetch is asked for again next time.
      loading = null;
      throw err;
    },
  );
  return loading;
}

// The editor once its code is in, else null.
export function loadedEditorPage(): EditorPageComponent | null {
  return loaded;
}
