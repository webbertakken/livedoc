// The tidiers, loaded on demand (docs/specs/008-canvas/layout-cleanup.md).
// The layouts, their router and the verdicts are only needed once someone runs a tidier from the command
// palette, so they stay out of the editor's first load: the first press loads them.

import type { cleanupElements } from './tab-cleanup';
import type { assessCleanup, verdictNotice } from './tidy-verdict';

export type TidyEngine = {
  cleanupElements: typeof cleanupElements;
  assessCleanup: typeof assessCleanup;
  verdictNotice: typeof verdictNotice;
};

let engine: TidyEngine | null = null;
let pending: Promise<TidyEngine> | null = null;

/** Load the tidiers once; every later call resolves to the same engine. */
export function loadTidyEngine(): Promise<TidyEngine> {
  pending ??= Promise.all([import('./tab-cleanup'), import('./tidy-verdict')]).then(
    ([cleanup, verdict]) =>
      (engine = {
        cleanupElements: cleanup.cleanupElements,
        assessCleanup: verdict.assessCleanup,
        verdictNotice: verdict.verdictNotice,
      }),
  );
  return pending;
}

/** Run `go` with the tidiers: now if they have loaded, once they have otherwise. */
export function withTidyEngine(go: (engine: TidyEngine) => void): void {
  if (engine) go(engine);
  else void loadTidyEngine().then(go);
}
