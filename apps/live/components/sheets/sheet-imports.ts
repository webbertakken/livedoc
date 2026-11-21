// The page's side of a spreadsheet's imports (docs/specs/029-sheets/imports.md "Fetching"): what the engine asks is
// fetched through the api, a few at once, and each answer handed back to the engine of the scope that asked. A
// spreadsheet whose rate is spent is asked again after a wait; while it is open, every import is asked again hourly.
// An IMPORTRANGE answered "connect these sheets" is kept by its source (formulas.md "Connecting two spreadsheets"),
// for the bar to offer Allow Access, and asked again once its source is connected.
import type { ImportAnswer, ImportAsk } from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';

/** Imports fetched at once: enough for a sheet of them to fill quickly, few enough to leave the api room. 1 to 8. */
export const IMPORTS_AT_ONCE = 4;
/** The wait before asking again once the spreadsheet's rate is spent: the rate's own minute. 30 s to 5 min. */
export const IMPORT_RETRY_MS = 60_000;
/** How often the imports still read are asked again while the spreadsheet is open (verified: Google's hour). */
export const IMPORT_REFRESH_MS = 3_600_000;
/** How often IMPORTRANGE's ranges are asked again while the spreadsheet is open (D77). 30 s to 10 min. */
export const RANGE_REFRESH_MS = 60_000;

type Job = { scope: string; ask: ImportAsk };

export type SheetImportsDeps = {
  fetch: (ask: ImportAsk) => Promise<ImportAnswer | 'later'>;
  land: (scope: string, key: string, answer: ImportAnswer) => void;
  wait?: (ms: number) => Promise<void>;
  // The sources waiting to be connected changed (the bar shows them).
  waiting?: () => void;
};

export class SheetImports {
  private readonly deps: SheetImportsDeps;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly queue: Job[] = [];
  private running = 0;
  // IMPORTRANGE asks answered "connect these sheets", by their source, then by key.
  private readonly unconnected = new Map<string, Map<string, Job>>();

  constructor(deps: SheetImportsDeps) {
    this.deps = deps;
    this.wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** What a scope's engine asked: fetched in turn. */
  take(scope: string, asks: readonly ImportAsk[]): void {
    for (const ask of asks) this.queue.push({ scope, ask });
    this.pump();
  }

  private pump(): void {
    while (this.running < IMPORTS_AT_ONCE && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.running++;
      void this.run(job).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async run(job: Job): Promise<void> {
    const answer = await this.deps.fetch(job.ask);
    if (answer === 'later') {
      debugLog('[sheet imports] rate spent; asking again', { inMs: IMPORT_RETRY_MS });
      await this.wait(IMPORT_RETRY_MS);
      this.queue.push(job);
      return;
    }
    this.note(job, 'error' in answer && answer.connect === true);
    this.deps.land(job.scope, job.ask.key, answer);
  }

  // Keep or let go of a range import waiting for its source to be connected.
  private note(job: Job, waits: boolean): void {
    const request = job.ask.request;
    if (request.kind !== 'range') return;
    const held = this.unconnected.get(request.source);
    const had = held?.has(job.ask.key) ?? false;
    if (waits === had) return;
    if (waits) {
      if (held) held.set(job.ask.key, job);
      else this.unconnected.set(request.source, new Map([[job.ask.key, job]]));
    } else {
      held!.delete(job.ask.key);
      if (held!.size === 0) this.unconnected.delete(request.source);
    }
    this.deps.waiting?.();
  }

  /** The sources IMPORTRANGEs wait on, for an Editor to connect. */
  waitingSources(): string[] {
    return [...this.unconnected.keys()];
  }

  /** Sources were connected (here or by a peer): their waiting imports are asked again. */
  connected(sources: readonly string[]): void {
    const jobs = sources.flatMap((source) => [...(this.unconnected.get(source)?.values() ?? [])]);
    if (jobs.length === 0) return;
    for (const job of jobs) this.queue.push(job);
    this.pump();
  }
}
