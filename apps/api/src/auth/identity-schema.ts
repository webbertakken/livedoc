// The identity tables' schema as better-auth wants it, against the schema our migrations build
// (docs/specs/014-identity/auth-and-guest-access.md). better-auth's CLI cannot reach
// D1, so the SQL is computed here instead: replay every migration into an in-memory SQLite, ask better-auth what is
// missing, and compile that to plain SQL for the next `migrations/NNNN_*.sql`. Empty means in step.
//
// Used by scripts/identity-schema.mts (writes the migration) and identity-schema.test.ts (fails CI when a
// better-auth upgrade or an option change wants a column no migration has added). Node only, never bundled.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { identityOptions } from './identity';
import type { Env } from '../types';

export async function pendingIdentitySql(migrationsDir: string): Promise<string> {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(`${migrationsDir}/${file}`, 'utf8'));
  }
  // Every method on, so every table and column any configuration can use exists.
  const env = {
    DB: db,
    BETTER_AUTH_SECRET: 'schema-only-secret-never-used-to-sign-anything',
    APP_BASE_URL: 'https://docs.nu',
    GOOGLE_AUTH_CLIENT_ID: 'schema-only',
    GOOGLE_AUTH_CLIENT_SECRET: 'schema-only',
    EMAIL_OUTBOX: '1',
  } as unknown as Env;
  const options = { ...identityOptions(env), database: db };
  const migrations = await getMigrations(options);
  const sql = (await migrations.compileMigrations()).trim();
  // Nothing to do compiles to a bare `;`.
  return sql === ';' ? '' : sql;
}
