import { debugLog } from '@/lib/debug-log';
import {
  KIND_FAMILY_IDS,
  KIND_FAMILY_LOADERS,
  type KindFamilyId,
  type KindFamilyModule,
} from './families';

// The page's kind families (docs/specs/016-platform/web-performance.md "An element kind's code loads with the board that holds it"):
// absent, loading, in, or failed. A family is asked for once however many places ask at the same time, is in for
// the rest of the page once it resolves, and is read synchronously from here only: the board's faces draw in the
// same frame as the elements they belong to, never through a lazy wrapper that misses it.

// Why a load was asked. Every reason but `idle` is needed: something on screen or a press waits for it.
export type LoadReason = 'open' | 'tab' | 'palette' | 'element' | 'idle' | 'retry';

export class KindFamilyNotLoaded extends Error {
  readonly family: KindFamilyId;
  constructor(family: KindFamilyId) {
    super(`Kind family ${family} is not loaded`);
    this.name = 'KindFamilyNotLoaded';
    this.family = family;
  }
}

type FailureHandler = (error: unknown, family: KindFamilyId) => void;

const loaded = new Map<KindFamilyId, unknown>();
const inFlight = new Map<KindFamilyId, Promise<boolean>>();
const failed = new Set<KindFamilyId>();
// The families in flight that something waits on, whatever reason first asked for them.
const neededWhileRunning = new Set<KindFamilyId>();
const listeners = new Set<() => void>();
let failedSnapshot: readonly KindFamilyId[] = [];
let onNeededFailure: FailureHandler = () => {};

function changed(): void {
  failedSnapshot = [...failed];
  for (const listener of listeners) listener();
}

// What a needed load that fails is handed to: the stale-build safety net (lib/element-kinds/install.ts).
export function setKindFamilyFailureHandler(handler: FailureHandler): void {
  onNeededFailure = handler;
}

export function isKindFamilyLoaded(id: KindFamilyId): boolean {
  return loaded.has(id);
}

// Resolves true once the family is in, false when its load failed; never rejects. A family in flight is joined.
export function loadKindFamily(id: KindFamilyId, reason: LoadReason): Promise<boolean> {
  if (loaded.has(id)) return Promise.resolve(true);
  const running = inFlight.get(id);
  if (running) {
    // An idle prefetch in flight becomes needed when something waits on it: its failure must then show.
    if (reason !== 'idle') neededWhileRunning.add(id);
    return running;
  }
  const needed = reason !== 'idle';
  if (needed) neededWhileRunning.add(id);
  debugLog(`[element-kinds] load family=${id} reason=${reason}`);
  const startedAt = performance.now();
  const run = KIND_FAMILY_LOADERS[id]()
    .then((module) => {
      loaded.set(id, module);
      failed.delete(id);
      debugLog(`[element-kinds] in family=${id} ms=${Math.round(performance.now() - startedAt)}`);
      return true;
    })
    .catch((error: unknown) => {
      if (neededWhileRunning.has(id)) {
        failed.add(id);
        console.warn(`[element-kinds] failed family=${id} reason=${reason}`, error);
        onNeededFailure(error, id);
      } else {
        debugLog(`[element-kinds] failed family=${id} reason=${reason} ${String(error)}`);
      }
      return false;
    })
    .finally(() => {
      inFlight.delete(id);
      neededWhileRunning.delete(id);
      changed();
    });
  inFlight.set(id, run);
  return run;
}

// A family's module, for code that runs only once the family is in (the faces, behind useKindFamilyReady). Reaching
// one that is not is a path the gate missed: it throws, so a test fails rather than a board drawing wrong.
export function requireKindFamily<F extends KindFamilyId>(id: F): KindFamilyModule<F> {
  if (!loaded.has(id)) throw new KindFamilyNotLoaded(id);
  return loaded.get(id) as KindFamilyModule<F>;
}

// The families whose needed load failed, the same array until that changes (for useSyncExternalStore).
export function failedKindFamilies(): readonly KindFamilyId[] {
  return failedSnapshot;
}

export async function retryFailedKindFamilies(): Promise<void> {
  await Promise.all([...failed].map((id) => loadKindFamily(id, 'retry')));
}

export function subscribeKindFamilies(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// One stable loader per family for prefetchWhenIdle, which runs each loader once per page.
export const KIND_FAMILY_PREFETCH: readonly (() => Promise<boolean>)[] = KIND_FAMILY_IDS.map(
  (id) => () => loadKindFamily(id, 'idle'),
);

export function resetKindFamiliesForTests(): void {
  loaded.clear();
  inFlight.clear();
  failed.clear();
  neededWhileRunning.clear();
  listeners.clear();
  failedSnapshot = [];
  onNeededFailure = () => {};
}
