// The pictures IMAGE shows on the page (docs/specs/029-sheets/imports.md "IMAGE"): each address fetched once through
// the api, a few at once, kept as an object URL while the spreadsheet is open; the least recently drawn let go past
// SHEET_IMAGES_KEPT. A picture not fetched leaves its cell empty. Never asked again hourly, as Google's IMAGE is not.

/** Pictures fetched at once, as the imports are (IMPORTS_AT_ONCE). 1 to 8. */
export const IMAGES_AT_ONCE = 4;
/** Pictures kept while the spreadsheet is open (D72): a screenful many times over, in bounded memory. 50 to 1,000. */
export const SHEET_IMAGES_KEPT = 200;

export type SheetImageState =
  { status: 'loading' } | { status: 'shown'; src: string } | { status: 'failed' };

const LOADING: SheetImageState = { status: 'loading' };
const FAILED: SheetImageState = { status: 'failed' };

export type SheetImageLoaderDeps = {
  fetch: (url: string) => Promise<Blob | null>;
  // The object URL a picture is drawn from, and its release; the browser's own by default.
  objectUrl?: (blob: Blob) => string;
  revoke?: (src: string) => void;
};

export class SheetImageLoader {
  private readonly deps: Required<SheetImageLoaderDeps>;
  // In the order last drawn, oldest first.
  private readonly states = new Map<string, SheetImageState>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly queue: string[] = [];
  private running = 0;
  private disposed = false;

  constructor(deps: SheetImageLoaderDeps) {
    this.deps = {
      objectUrl: (blob) => URL.createObjectURL(blob),
      revoke: (src) => URL.revokeObjectURL(src),
      ...deps,
    };
  }

  /** The picture at `url` as it stands; loading until it is asked for and arrives. */
  state(url: string): SheetImageState {
    return this.states.get(url) ?? LOADING;
  }

  /** A cell draws the picture: fetched on first sight, and kept as the most recently drawn. */
  want(url: string): void {
    const known = this.states.get(url);
    this.states.delete(url);
    this.states.set(url, known ?? LOADING);
    if (known) return;
    this.queue.push(url);
    this.pump();
    this.evict();
  }

  /** Hear when the picture at `url` changes; the returned function stops hearing. */
  subscribe(url: string, listener: () => void): () => void {
    let set = this.listeners.get(url);
    if (!set) this.listeners.set(url, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(url);
    };
  }

  /** The spreadsheet closed: every picture let go. */
  dispose(): void {
    this.disposed = true;
    for (const state of this.states.values())
      if (state.status === 'shown') this.deps.revoke(state.src);
    this.states.clear();
    this.queue.length = 0;
  }

  private pump(): void {
    while (this.running < IMAGES_AT_ONCE && this.queue.length > 0) {
      const url = this.queue.shift()!;
      this.running++;
      void this.load(url).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async load(url: string): Promise<void> {
    const blob = await this.deps.fetch(url);
    // Let go while it was on its way: nothing to keep.
    if (this.disposed || !this.states.has(url)) return;
    this.states.set(url, blob ? { status: 'shown', src: this.deps.objectUrl(blob) } : FAILED);
    for (const listener of this.listeners.get(url) ?? []) listener();
  }

  // Past the bound, the least recently drawn pictures no cell is drawing are let go.
  private evict(): void {
    let over = this.states.size - SHEET_IMAGES_KEPT;
    for (const [url, state] of this.states) {
      if (over <= 0) break;
      if (this.listeners.has(url)) continue;
      if (state.status === 'shown') this.deps.revoke(state.src);
      this.states.delete(url);
      over--;
    }
  }
}
