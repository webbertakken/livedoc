import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { DocumentSql, DocumentSqlCursor } from './document-room/document-db';
import { assertD1Compound } from './test-d1-compound';

// `ctx.storage.sql` for node tests: SqlStorage's `exec` over a node:sqlite database, for a room's SQLite
// (docs/specs/006-document/document-storage.md). Like SqlStorage, a call without bindings may hold several
// statements (the schema); a call with bindings is one statement. Not a `.test.ts` file, so vitest doesn't collect
// it as a suite.

function toNode(value: unknown): SQLInputValue {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value as SQLInputValue;
}

// More than one statement: a `;` with anything but whitespace after it.
function isScript(query: string): boolean {
  return query.trimEnd().replace(/;$/, '').includes(';');
}

export function nodeDocumentSql(db: DatabaseSync): DocumentSql {
  return {
    exec(query: string, ...bindings: unknown[]): DocumentSqlCursor {
      // A room's SQLite holds D1's query limits: a compound SELECT of more than five terms is refused.
      assertD1Compound(query);
      if (bindings.length === 0 && isScript(query)) {
        db.exec(query);
        return { toArray: () => [], columnNames: [] };
      }
      const statement = db.prepare(query);
      const columnNames = statement.columns().map((c) => c.name);
      const args = bindings.map(toNode);
      if (columnNames.length === 0) {
        statement.run(...args);
        return { toArray: () => [], columnNames };
      }
      const rows = statement.all(...args).map((row) => ({ ...row }));
      return { toArray: () => rows, columnNames };
    },
  };
}

// DurableObjectStorage.transactionSync over node:sqlite: a savepoint, so one may sit inside another.
export function nodeTransaction(db: DatabaseSync): <T>(fn: () => T) => T {
  let depth = 0;
  return <T>(fn: () => T): T => {
    const name = `room_tx_${depth++}`;
    db.exec(`SAVEPOINT ${name}`);
    try {
      const result = fn();
      db.exec(`RELEASE ${name}`);
      return result;
    } catch (err) {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
      throw err;
    } finally {
      depth--;
    }
  };
}
