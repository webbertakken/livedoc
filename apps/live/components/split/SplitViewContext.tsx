'use client';

import { createStoreContext } from '@/hooks/ui/store-context';
import type { SplitView } from '@/hooks/ui/useSplitView';

// The side by side state (docs/specs/007-editor/split-view.md), for the chrome that offers or marks
// it: the tab pill's "beside" marker and the tab menu's Open Side by Side. Absent outside the editor
// (and in tests that render the tab bar alone), where those simply don't show.
// Reached through a store, not a plain context: it sits above the canvas, and a new value would have React walk the
// whole board for its readers (docs/specs/008-canvas/canvas-performance.md "A change above the board walks no
// board").
const SplitViewContextStore = createStoreContext<SplitView | null>(null);
export const SplitViewContext = { Provider: SplitViewContextStore.Provider };

export function useSplitViewContext(): SplitView | null {
  return SplitViewContextStore.useValue();
}
