// A document's own SQLite behind the D1 surface (docs/specs/006-document/document-storage.md). The content
// modules
// (db/tabs.ts, db/tab-stats.ts, db/image-refs.ts, db/changesets.ts, ...) were written against D1's
// prepare/bind/first/all/run/batch; inside the document's Durable Object they run unchanged against
// `ctx.storage.sql` through this adapter, as `env.DOCUMENT_DB`.
//
// What it keeps of D1's behaviour, because the modules rely on it:
//   - `batch` is atomic: it runs inside `transactionSync`, so a throw (the `tab_rev_stale` trigger's abort, a
//     constraint) rolls the whole batch back, as D1 does.
//   - `run().meta.changes` is SQLite's `changes()` for a write, 0 for a read.
//   - a boolean binds as 1 / 0 and `undefined` is refused, as D1 does.
// Every call is synchronous underneath (the Durable Object's SQLite is in-process); the promises are D1's shape.

// The slice of `SqlStorage` this uses, so a test can hand it node:sqlite (test-document-sql.ts).
export type DocumentSql = {
  exec(query: string, ...bindings: unknown[]): DocumentSqlCursor;
};
export type DocumentSqlCursor = {
  toArray(): Record<string, unknown>[];
  readonly columnNames: string[];
};

export type DocumentDbHooks = {
  // Runs `fn` as one transaction (DurableObjectStorage.transactionSync).
  transaction: <T>(fn: () => T) => T;
  // Before the first write: the schema, made on first use (document-schema.ts).
  ensureSchema: () => void;
  // Whether the schema is there: a read of a room that has none answers empty and makes nothing (R1).
  hasSchema: () => boolean;
  // After every statement that may have written: the room arms its outbox flush (document-room.ts).
  onWrite: () => void;
};

type Bindable = string | number | null | ArrayBuffer;

function toSql(value: unknown): Bindable {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined) throw new TypeError('D1_TYPE_ERROR: undefined is not a bindable value');
  return value as Bindable;
}

type Meta = { changes: number; rows_read?: number; rows_written?: number };
type Result = { results: Record<string, unknown>[]; success: true; meta: Meta };

class DocumentStatement {
  private readonly db: DocumentDb;
  readonly query: string;
  readonly args: Bindable[];

  constructor(db: DocumentDb, query: string, args: Bindable[] = []) {
    this.db = db;
    this.query = query;
    this.args = args;
  }

  bind(...values: unknown[]): DocumentStatement {
    return new DocumentStatement(this.db, this.query, values.map(toSql));
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.db.execute(this).results[0] ?? null;
    if (column) return (row ? (row[column] ?? null) : null) as T | null;
    return row as T | null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true; meta: Meta }> {
    return this.db.execute(this) as { results: T[]; success: true; meta: Meta };
  }

  async run(): Promise<Result> {
    return this.db.execute(this);
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const { results } = this.db.execute(this);
    return results.map((r) => Object.values(r)) as T[];
  }
}

/** A write through a read-only view (`DocumentDb.readOnly`): refused, nothing run. */
export const DOCUMENT_READ_ONLY = 'document_read_only';

const NO_HOOKS = { ensureSchema: () => {}, onWrite: () => {} };

export class DocumentDb {
  private readonly sql: DocumentSql;
  private readonly hooks: DocumentDbHooks;
  private readonly readOnlyView: boolean;

  constructor(sql: DocumentSql, hooks: DocumentDbHooks, readOnlyView = false) {
    this.sql = sql;
    this.hooks = hooks;
    this.readOnlyView = readOnlyView;
  }

  /**
   * A view that only reads (docs/specs/006-document/document-storage.md "Refreshing the summaries"): it never makes or
   * upgrades the schema, never tells the room of a write, refuses any statement that may write, and reads a table an
   * older schema lacks as empty, so reading a room through it leaves the room's storage as it was.
   */
  static readOnly(sql: DocumentSql, hasSchema: () => boolean): DocumentDb {
    return new DocumentDb(sql, { ...NO_HOOKS, transaction: (fn) => fn(), hasSchema }, true);
  }

  prepare(query: string): DocumentStatement {
    return new DocumentStatement(this, query);
  }

  // One transaction for the whole batch, as D1. The results are D1's: a read's rows, a write's change count.
  async batch(statements: DocumentStatement[]): Promise<Result[]> {
    const writes = statements.some((s) => mayWrite(s.query));
    if (this.readOnlyView) {
      if (writes) throw new Error(DOCUMENT_READ_ONLY);
      if (!this.hooks.hasSchema()) return statements.map(() => emptyResult());
      return statements.map((s) => this.readOne(s));
    }
    if (!writes && !this.hooks.hasSchema()) return statements.map(() => emptyResult());
    this.hooks.ensureSchema();
    const results = this.hooks.transaction(() => statements.map((s) => this.executeOne(s)));
    // A batch of reads changed nothing: the room arms no flush or upkeep for it.
    if (writes || results.some((r) => r.meta.changes > 0)) this.hooks.onWrite();
    return results;
  }

  async exec(query: string): Promise<{ count: number; duration: number }> {
    if (this.readOnlyView) throw new Error(DOCUMENT_READ_ONLY);
    this.hooks.ensureSchema();
    this.sql.exec(query);
    this.hooks.onWrite();
    return { count: 1, duration: 0 };
  }

  execute(statement: DocumentStatement): Result {
    if (this.readOnlyView) {
      if (mayWrite(statement.query)) throw new Error(DOCUMENT_READ_ONLY);
      return this.hooks.hasSchema() ? this.readOne(statement) : emptyResult();
    }
    if (!mayWrite(statement.query) && !this.hooks.hasSchema()) return emptyResult();
    this.hooks.ensureSchema();
    const result = this.executeOne(statement);
    if (result.meta.changes > 0 || mayWrite(statement.query)) this.hooks.onWrite();
    return result;
  }

  // `total_changes()` moves only when a statement (or a trigger it fired) wrote, so a read costs no
  // `changes()` lookup and a read never reports the previous write's count.
  private executeOne(statement: DocumentStatement): Result {
    const before = this.totalChanges();
    const cursor = this.sql.exec(statement.query, ...statement.args);
    const results = cursor.toArray();
    const wrote = this.totalChanges() !== before;
    const changes = wrote ? Number(this.sql.exec('SELECT changes() AS n').toArray()[0]?.n ?? 0) : 0;
    return { results, success: true, meta: { changes } };
  }

  // A read-only view's read: a table an older schema has not made yet holds no rows.
  private readOne(statement: DocumentStatement): Result {
    try {
      const results = this.sql.exec(statement.query, ...statement.args).toArray();
      return { results, success: true, meta: { changes: 0 } };
    } catch (error) {
      if (error instanceof Error && /no such table/i.test(error.message)) return emptyResult();
      throw error;
    }
  }

  private totalChanges(): number {
    return Number(this.sql.exec('SELECT total_changes() AS n').toArray()[0]?.n ?? 0);
  }

  // The D1 type the content modules are written against.
  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

function emptyResult(): Result {
  return { results: [], success: true, meta: { changes: 0 } };
}

// A statement whose text starts as a write: the room hears about it even when it changed nothing, which
// costs it only a flag check.
function mayWrite(query: string): boolean {
  return /^\s*(INSERT|UPDATE|DELETE|REPLACE|WITH)\b/i.test(query);
}
