import type { Env } from './types';

// Counts the D1 round trips a request makes (docs/specs/016-platform/web-performance.md "The api"): one per
// statement run on its own, one per batch. A room's outbox drain (document-outbox.ts) runs on the room's alarm in
// production, not inside the request, so its statements, which all carry G2's guard, are not counted.
//
// Not a `.test.ts` file, so vitest doesn't collect it as a suite.

const DRAIN_GUARD = 'EXISTS (SELECT 1 FROM documents WHERE id = ?1)';

export type D1RoundTrips = {
  // The SQL of each round trip, in order; a batch is its statements joined by ' ; '.
  readonly trips: string[];
  reset: () => void;
};

type Statement = { query?: string } & Record<string, unknown>;

export function countD1RoundTrips(env: Pick<Env, 'DB'>): D1RoundTrips {
  const trips: string[] = [];
  const db = env.DB as unknown as {
    prepare: (query: string) => Statement;
    batch: (statements: Statement[]) => Promise<unknown>;
  };
  const prepare = db.prepare.bind(db);
  const batch = db.batch.bind(db);
  const tag = (statement: Statement, query: string): Statement => {
    const record =
      (run: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) => {
        if (!query.includes(DRAIN_GUARD)) trips.push(query.replace(/\s+/g, ' ').trim());
        return run(...args);
      };
    const tagged: Statement = { ...statement, query };
    for (const terminal of ['first', 'all', 'run'] as const) {
      const run = statement[terminal];
      if (typeof run === 'function') tagged[terminal] = record(run as (...a: unknown[]) => unknown);
    }
    const bind = statement['bind'];
    if (typeof bind === 'function') {
      tagged['bind'] = (...values: unknown[]) =>
        tag((bind as (...v: unknown[]) => Statement)(...values), query);
    }
    return tagged;
  };
  db.prepare = (query: string) => tag(prepare(query), query);
  db.batch = (statements: Statement[]) => {
    const queries = statements.map((s) => s.query ?? '?');
    if (!queries.every((q) => q.includes(DRAIN_GUARD))) {
      trips.push(queries.map((q) => q.replace(/\s+/g, ' ').trim()).join(' ; '));
    }
    return batch(statements);
  };
  return { trips, reset: () => void trips.splice(0) };
}
