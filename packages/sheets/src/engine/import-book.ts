// A workbook's imports (docs/specs/029-sheets/imports.md "Fetching"): each distinct import's answer, the formula
// cells reading it, and what is still to be asked of the page. Only an editor's engine keeps one; elsewhere the
// imports read their refusal. Allowing, an answer arriving and the hourly refresh name the cells to work out again.
import {
  importKey,
  type ImportAccess,
  type ImportAnswer,
  type ImportAsk,
  type ImportRequest,
} from '../imports/import-request';
import type { CellNo } from './cell-numbers';

/** What a formula reads of an import: its answer, `pending` until it arrives, `blocked` until access is allowed,
 * `offline` while the spreadsheet is saved only in this browser. */
export type ImportRead = ImportAnswer | 'pending' | 'blocked' | 'offline';

// The key the cells that only ask for access are noted under: never an import's (those are JSON arrays).
const ACCESS_KEY = 'access';

export class ImportBook {
  private access: ImportAccess;
  private readonly answers = new Map<string, ImportAnswer>();
  private readonly requests = new Map<string, ImportRequest>();
  private readonly readers = new Map<string, Set<CellNo>>();
  private readonly keysOf = new Map<CellNo, Set<string>>();
  // Asked of the page and not yet answered, so never asked twice at once.
  private readonly asked = new Set<string>();
  // Cells typed again since they last read an import: their next read asks afresh.
  private readonly retypedCells = new Set<CellNo>();
  private asks: ImportAsk[] = [];

  constructor(access: ImportAccess) {
    this.access = access;
  }

  /** An import as `reader` reads it, the read noted; a first read asks the page for it. */
  read(request: ImportRequest, reader: CellNo): ImportRead {
    const key = importKey(request);
    this.note(key, reader);
    this.requests.set(key, request);
    if (this.access !== 'allowed') return this.access;
    const answer = this.answers.get(key);
    if (this.retypedCells.delete(reader)) this.ask(key, true);
    if (answer) return answer;
    this.ask(key, false);
    return 'pending';
  }

  /** Whether `reader` may fetch, the read noted so allowing works it out again; nothing is asked (IMAGE's page fetches). */
  accessFor(reader: CellNo): ImportAccess {
    this.note(ACCESS_KEY, reader);
    return this.access;
  }

  private note(key: string, reader: CellNo): void {
    let set = this.readers.get(key);
    if (!set) this.readers.set(key, (set = new Set()));
    set.add(reader);
    let keys = this.keysOf.get(reader);
    if (!keys) this.keysOf.set(reader, (keys = new Set()));
    keys.add(key);
  }

  private ask(key: string, fresh: boolean): void {
    if (this.asked.has(key)) return;
    this.asked.add(key);
    this.asks.push({ key, request: this.requests.get(key)!, fresh });
  }

  /** A formula is worked out afresh: what it read before is no longer its. */
  dropReader(no: CellNo): void {
    const keys = this.keysOf.get(no);
    if (!keys) return;
    for (const key of keys) this.readers.get(key)?.delete(no);
    this.keysOf.delete(no);
  }

  /** Cells were typed again: an import one read before is asked afresh when it reads one again (Google's). */
  retyped(nos: readonly CellNo[]): void {
    for (const no of nos)
      if (this.keysOf.has(no)) {
        this.retypedCells.add(no);
        this.dropReader(no);
      }
  }

  /** The page's answer to an ask; the cells reading it when it differs from what they read. */
  land(key: string, answer: ImportAnswer): CellNo[] {
    this.asked.delete(key);
    const before = this.answers.get(key);
    if (before && JSON.stringify(before) === JSON.stringify(answer)) return [];
    this.answers.set(key, answer);
    return [...(this.readers.get(key) ?? [])];
  }

  /** Access allowed for the spreadsheet, for good: every cell reading an import, the first time. */
  allow(): CellNo[] {
    if (this.access === 'allowed') return [];
    this.access = 'allowed';
    return [...this.keysOf.keys()];
  }

  /** The spreadsheet was synced to LiveDoc: its imports wait for Allow Access now, unless it is already allowed. */
  online(allowed: boolean): CellNo[] {
    if (this.access !== 'offline') return [];
    this.access = allowed ? 'allowed' : 'blocked';
    return [...this.keysOf.keys()];
  }

  /** The hour is up: every import still read is asked again; answers no formula reads are let go. */
  refresh(): void {
    if (this.access !== 'allowed') return;
    for (const key of [...this.answers.keys()]) {
      if ((this.readers.get(key)?.size ?? 0) > 0) this.ask(key, false);
      else {
        this.answers.delete(key);
        this.requests.delete(key);
        this.readers.delete(key);
      }
    }
  }

  /** Cell numbers start afresh (the workbook restarted): readers are noted again as formulas are worked out. */
  renumbered(): void {
    this.readers.clear();
    this.keysOf.clear();
    this.retypedCells.clear();
  }

  /** What to ask of the page since the last call. */
  takeAsks(): ImportAsk[] {
    const out = this.asks;
    this.asks = [];
    return out;
  }
}
