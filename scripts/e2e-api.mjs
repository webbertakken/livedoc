#!/usr/bin/env node
// The E2E stack's api worker (docs/specs/003-system-architecture/e2e-smoke.md "The api worker"): apps/api run on
// Miniflare directly, the way `wrangler dev --local` runs it but without its ProxyWorker. That proxy forwards every
// request to the worker over a kept-alive connection which the worker's side closes after 5 s idle; a POST written
// into one as it closes fails ("Network connection lost") and, unlike a GET, is not resent
// (cloudflare/workers-sdk#14641). Here the requests reach workerd's own socket and the worker in process.
//
//   node scripts/e2e-api.mjs --port <port> [--var NAME:value ...]
//
// The worker is bundled as a deploy bundles it (`wrangler deploy --dry-run`), its bindings are the ones wrangler
// derives from apps/api/wrangler.toml (and .dev.vars), and its state persists where `wrangler dev` and
// `db:migrate:local` keep it (apps/api/.wrangler/state/v3), so the migrations the stack applies are the ones it
// reads. Miniflare is wrangler's own, so the two never drift apart.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { bundleModules } from '../apps/api/scripts/bundle-modules.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'apps', 'api');
const CONFIG = path.join(API_DIR, 'wrangler.toml');
const PERSIST_ROOT = path.join(API_DIR, '.wrangler', 'state', 'v3');

const requireFromApi = createRequire(path.join(API_DIR, 'package.json'));
const wrangler = requireFromApi('wrangler');
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = createRequire(
  requireFromApi.resolve('wrangler'),
)('miniflare');

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    var: { type: 'string', multiple: true, default: [] },
  },
});
const port = Number(values.port);
if (!Number.isInteger(port) || port <= 0) {
  console.error('[e2e-api] --port <port> is required');
  process.exit(2);
}

// `NAME:value`, as `wrangler dev --var` takes it; the value may be empty or hold colons.
function parseVar(arg) {
  const at = arg.indexOf(':');
  if (at <= 0) throw new Error(`--var ${arg}: expected NAME:value`);
  return [arg.slice(0, at), arg.slice(at + 1)];
}
const vars = Object.fromEntries(values.var.map(parseVar));

function bundle(outdir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['exec', 'wrangler', 'deploy', '--dry-run', '--outdir', outdir, '--config', CONFIG],
      { cwd: API_DIR, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`bundling the api exited ${code}`)),
    );
  });
}

const outdir = mkdtempSync(path.join(tmpdir(), 'livedoc-e2e-api-'));
let mf = null;
async function shutdown(code) {
  try {
    await mf?.dispose();
  } finally {
    rmSync(outdir, { recursive: true, force: true });
    process.exit(code);
  }
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

try {
  console.log('[e2e-api] bundling the api worker…');
  await bundle(outdir);
  const config = wrangler.unstable_readConfig({ config: CONFIG });
  const { workerOptions } = wrangler.unstable_getMiniflareWorkerOptions(config);
  // Wrangler's options are in Miniflare's v4 shape, which it converts the same way for `wrangler dev`.
  mf = new Miniflare(
    convertV4MiniflareOptions({
      ...workerOptions,
      // Named as `wrangler dev` names it: the persisted Durable Objects and databases are keyed by it.
      name: config.name,
      modulesRules: undefined,
      modules: bundleModules(outdir, workerOptions.modulesRules),
      modulesRoot: outdir,
      bindings: { ...workerOptions.bindings, ...vars },
      rootPath: API_DIR,
      resourcePersistencePath: PERSIST_ROOT,
      host: '127.0.0.1',
      port,
      // No request.cf fetched from Cloudflare: the stack is offline and the api reads none of it.
      cf: false,
      log: new Log(LogLevel.INFO),
    }),
  );
  const url = await mf.ready;
  console.log(`[e2e-api] api worker on ${url.href} (Miniflare, no dev proxy)`);
} catch (err) {
  console.error('[e2e-api] the api worker did not start:', err);
  await shutdown(1);
}
