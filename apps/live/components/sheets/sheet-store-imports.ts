// A spreadsheet's imports on the page, for its sheet store (docs/specs/029-sheets/imports.md "Fetching", formulas.md
// "Other workbooks"): what the engines ask is fetched through the api; the web's imports are asked again hourly and
// IMPORTRANGE's ranges every minute while anyone reads the store; the record's access and connected sources, as they
// change, reach every engine and the ranges waiting on them. A Plan document has none of it (access null).
import type { EnginePort, ImportAccess, ImportAnswer, ImportAsk } from '@livedoc/sheets';
import { IMPORT_REFRESH_MS, RANGE_REFRESH_MS, SheetImports } from './sheet-imports';
import { VolatileTicker } from './volatile-ticker';

export type StoreImportsDeps = {
  fetch: (ask: ImportAsk) => Promise<ImportAnswer | 'later'>;
  // The store's engines, by scope.
  ports: () => ReadonlyMap<string, EnginePort>;
  // The sources waiting to be connected changed: the bar reads them again.
  waiting: () => void;
  page: Document | null;
};

export class StoreImports {
  private readonly deps: StoreImportsDeps;
  private readonly fetcher: SheetImports;
  private readonly webTicker: VolatileTicker;
  private readonly rangeTicker: VolatileTicker;
  private access: ImportAccess | null = null;
  private sources: ReadonlySet<string> = new Set();

  constructor(deps: StoreImportsDeps) {
    this.deps = deps;
    this.fetcher = new SheetImports({
      fetch: deps.fetch,
      land: (scope, key, answer) => deps.ports().get(scope)?.landImport(key, answer),
      waiting: deps.waiting,
    });
    const refresh = (family: 'web' | 'ranges') => () => {
      for (const port of deps.ports().values()) port.refreshImports(family);
    };
    this.webTicker = new VolatileTicker(refresh('web'), deps.page);
    this.rangeTicker = new VolatileTicker(refresh('ranges'), deps.page);
  }

  /** What a scope's engine asked: fetched in turn. */
  take(scope: string, asks: readonly ImportAsk[]): void {
    this.fetcher.take(scope, asks);
  }

  /** The record as it now stands: a sync, an Allow Access or a connected source told to every engine once. */
  update(access: ImportAccess | null, sources: readonly string[]): void {
    const before = this.access;
    this.access = access;
    // The document was synced to LiveDoc: its imports wait for Allow Access (imports.md "A spreadsheet in This
    // Browser"), or fetch when it was allowed before it was taken offline.
    if (before === 'offline' && (access === 'allowed' || access === 'blocked'))
      for (const port of this.deps.ports().values()) port.onlineImports(access === 'allowed');
    // An Editor allowed the imports (theirs or a peer's Allow Access): every engine fetches them now.
    if (before === 'blocked' && access === 'allowed')
      for (const port of this.deps.ports().values()) port.allowImports();
    const added = sources.filter((id) => !this.sources.has(id));
    this.sources = new Set(sources);
    // Sources connected (here or by a peer): the ranges waiting on them are asked again.
    if (added.length > 0) this.fetcher.connected(added);
  }

  /** The sources IMPORTRANGEs wait on, for an Editor to connect (formulas.md "Connecting two spreadsheets"). */
  waitingSources(): string[] {
    return this.fetcher.waitingSources();
  }

  /** Someone reads the store (true) or no one does: the refreshes run only while it is read. */
  run(read: boolean): void {
    const on = read && this.access !== null;
    this.webTicker.every(on ? IMPORT_REFRESH_MS : null);
    this.rangeTicker.every(on ? RANGE_REFRESH_MS : null);
  }
}
