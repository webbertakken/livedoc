// The worker issues ledger for tests (docs/specs/016-platform/worker-issues.md "Vocabulary"): a real ledger on its own
// node:sqlite database, and the env binding that reaches it as the runtime's stub would, every call a promise. Not a
// `.test.ts` file, so vitest doesn't collect it as a suite.
import { DatabaseSync } from 'node:sqlite';
import { nodeDocumentSql, nodeTransaction } from '../test-document-sql';
import type { Env } from '../types';
import { WorkerIssuesLedger } from './ledger';

export function testLedger(env?: Env): {
  ledger: WorkerIssuesLedger;
  sql: DatabaseSync;
  wake: () => WorkerIssuesLedger;
} {
  const sql = new DatabaseSync(':memory:');
  const state = {
    storage: { sql: nodeDocumentSql(sql), transactionSync: nodeTransaction(sql) },
  } as unknown as DurableObjectState;
  const make = () => new WorkerIssuesLedger(state, env ?? ({} as Env));
  return { ledger: make(), sql, wake: make };
}

type Ledger = WorkerIssuesLedger;
type Method =
  | 'claim'
  | 'release'
  | 'hold'
  | 'held'
  | 'dropHeld'
  | 'rememberOperator'
  | 'operator'
  | 'claimEmail';

// `env.WORKER_ISSUES_LEDGER` over a test ledger; `down` makes every call reject, as an unreachable object does.
export function ledgerBinding(ledger: Ledger, opts: { down?: () => boolean } = {}) {
  const methods: Method[] = [
    'claim',
    'release',
    'hold',
    'held',
    'dropHeld',
    'rememberOperator',
    'operator',
    'claimEmail',
  ];
  const stub = Object.fromEntries(
    methods.map((m) => [
      m,
      async (...args: unknown[]) => {
        if (opts.down?.()) throw new Error('ledger down');
        return (ledger[m] as (...a: unknown[]) => unknown).call(ledger, ...args);
      },
    ]),
  );
  return {
    idFromName: (name: string) => name,
    get: () => stub,
  } as unknown as Env['WORKER_ISSUES_LEDGER'];
}
