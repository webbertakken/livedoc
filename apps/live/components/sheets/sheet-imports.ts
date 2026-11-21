// The page's side of a spreadsheet's imports (docs/specs/029-sheets/imports.md "Fetching"): what the engine asks is
// fetched through the api, a few at once, and each answer handed back to the engine of the scope that asked. A
// spreadsheet whose rate is spent is asked again after a wait; while it is open, every import is asked again hourly.
import type { ImportAnswer, ImportAsk } from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';

/** Imports fetched at once: enough for a sheet of them to fill quickly, few enough to leave the api room. 1 to 8. */
export const IMPORTS_AT_ONCE = 4;
/** The wait before asking again once the spreadsheet's rate is spent: the rate's own minute. 30 s to 5 min. */
export const IMPORT_RETRY_MS = 60_000;
/** How often the imports still read are asked again while the spreadsheet is open (verified: Google's hour). */
export const IMPORT_REFRESH_MS = 3_600_000;

type Job = { scope: string; ask: ImportAsk };

export type SheetImportsDeps = {
  fetch: (ask: ImportAsk) => Promise<ImportAnswer | 'later'>;
  land: (scope: string, key: string, answer: ImportAnswer) => void;
  wait?: (ms: number) => Promise<void>;
};

export class SheetImports {
  private readonly deps: SheetImportsDeps;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly queue: Job[] = [];
  private running = 0;

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
    this.deps.land(job.scope, job.ask.key, answer);
  }
}
