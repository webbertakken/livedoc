// Pull request previews (docs/specs/016-platform/preview-deployments.md): one complete, isolated copy of
// docs.nu per pull request, on workers.dev, derived from the production wrangler configs.
//
//   node scripts/preview.mjs deploy <pr> <branch>      create or update the preview; prints both addresses
//   node scripts/preview.mjs wait-host <pr> <branch>   wait until https://<branch>.preview.docs.nu answers
//   node scripts/preview.mjs link <pr> <sha> <branch>  name the preview in the pull request's description
//   node scripts/preview.mjs unlink <pr>               take it out again
//   node scripts/preview.mjs teardown <pr>             delete every resource the preview owns
//
// A preview is reached at https://<branch>.preview.docs.nu (a custom domain on its router) and at its
// router's workers.dev address. Every resource is named after the pull request, so a renamed branch
// moves the address and nothing else.
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. `deploy` expects `pnpm build` to have run; its
// NEXT_PUBLIC_BUILD_ID, when set, becomes the api's BUILD_ID. The pure helpers are exported for
// apps/help/lib/preview.test.ts.

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { writeSlot } from './pr-description.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_PREFIX = 'docs-nu-';
const PREVIEW_CONFIG = 'wrangler.preview.json';
const LOCATION = 'weur';
const PREVIEW_DOMAIN = 'preview.docs.nu';
const DNS_LABEL_MAX = 63;
const HASH_LENGTH = 6;

/** Deploy order: the api first (two apps bind it), the router, which binds the other five, last. */
export const PREVIEW_APPS = ['api', 'marketing', 'telemetry', 'help', 'live', 'router'];

/**
 * A branch name as one DNS label: lowercase letters, digits and single hyphens, never at either end. A
 * name too long for a label keeps its start and gains a hash of the whole name, so two long branches that
 * share a start still get different labels.
 * @param {string | undefined} branch
 */
export function branchLabel(branch) {
  const slug = (branch ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug)
    throw new Error(`preview: the branch name "${branch ?? ''}" has nothing to name a host by`);
  if (slug.length <= DNS_LABEL_MAX) return slug;
  const hash = createHash('sha256')
    .update(branch ?? '')
    .digest('hex')
    .slice(0, HASH_LENGTH);
  const head = slug.slice(0, DNS_LABEL_MAX - HASH_LENGTH - 1).replace(/-+$/, '');
  return `${head}-${hash}`;
}

/**
 * @param {number} pr
 * @param {string} subdomain the account's workers.dev subdomain
 * @param {string} branch the pull request's head branch
 */
export function previewNames(pr, subdomain, branch) {
  const resources = previewResources(pr);
  const host = `${branchLabel(branch)}.${PREVIEW_DOMAIN}`;
  return {
    ...resources,
    host,
    origin: `https://${host}`,
    workersDevOrigin: `https://${resources.prefix}-router.${subdomain}.workers.dev`,
  };
}

/**
 * The preview slot's line in the pull request's description: the commit it was built from, and the host.
 * @param {string} sha the full commit sha
 * @param {string} branch the pull request's head branch
 */
export function previewLine(sha, branch) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`preview: not a full commit sha: ${sha}`);
  return `Live preview (\`${sha.slice(0, 7)}\`): https://${branchLabel(branch)}.${PREVIEW_DOMAIN}`;
}

/** What a pull request's preview owns on Cloudflare, by name: all teardown needs. @param {number} pr */
function previewResources(pr) {
  const prefix = `docs-nu-pr-${pr}`;
  return { prefix, d1: prefix, bucket: `${prefix}-images` };
}

/** @param {string | undefined} arg */
export function prNumber(arg) {
  if (!arg || !/^[1-9]\d*$/.test(arg))
    throw new Error(`preview: not a pull request number: ${arg}`);
  return Number(arg);
}

/** `docs-nu-<app>` → `docs-nu-pr-<n>-<app>`; anything else is not docs.nu's and is refused. */
function previewWorker(name, prefix) {
  if (!name.startsWith(PRODUCTION_PREFIX)) {
    throw new Error(`preview: ${name} is not a docs.nu worker`);
  }
  return `${prefix}-${name.slice(PRODUCTION_PREFIX.length)}`;
}

/** Rate limiter ids are account-wide: production holds 7001-7012, every preview shares 7101-7112. */
function previewLimiter(binding) {
  if (binding.type !== 'ratelimit') return binding;
  const id = String(binding.namespace_id);
  if (!/^70\d\d$/.test(id)) {
    throw new Error(
      `preview: rate limiter ${binding.name} uses ${id}, outside docs.nu's 7001-7099`,
    );
  }
  return { ...binding, namespace_id: `71${id.slice(2)}` };
}

/**
 * A production wrangler config, as one pull request's preview deploys it.
 * @param {Record<string, any>} config the parsed top-level wrangler.toml
 * @param {{ app: string, names: ReturnType<typeof previewNames>, d1Id: string }} options
 * @returns {Record<string, any>} the preview's wrangler config, as wrangler.preview.json holds it
 */
export function previewConfig(config, { app, names, d1Id }) {
  const { env: _env, routes: _routes, ...rest } = structuredClone(config);
  if (rest.kv_namespaces) throw new Error(`preview: ${app} binds KV; previews do not run it`);
  /** @type {Record<string, any>} */
  const out = {
    ...rest,
    name: previewWorker(rest.name, names.prefix),
    workers_dev: app === 'router',
    preview_urls: false,
  };
  if (rest.services) {
    out.services = rest.services.map((s) => ({
      ...s,
      service: previewWorker(s.service, names.prefix),
    }));
  }
  if (rest.d1_databases) {
    if (!d1Id) throw new Error(`preview: ${app} binds D1 but no preview database id was given`);
    out.d1_databases = rest.d1_databases.map((d) => ({
      ...d,
      database_name: names.d1,
      database_id: d1Id,
    }));
  }
  if (rest.r2_buckets) {
    out.r2_buckets = rest.r2_buckets.map((b) => ({ ...b, bucket_name: names.bucket }));
  }
  if (rest.unsafe?.bindings) {
    out.unsafe = { ...rest.unsafe, bindings: rest.unsafe.bindings.map(previewLimiter) };
  }
  if (app === 'api') {
    // A preview sends no email: sign-in codes land in its outbox (docs/specs/014-identity/auth-and-guest-access.md
    // "Previews"), so the send_email binding is dropped.
    out.vars = {
      ...rest.vars,
      AI_ALLOWED_ORIGINS: names.origin,
      APP_BASE_URL: names.origin,
      EMAIL_OUTBOX: '1',
    };
    delete out.send_email;
  }
  if (app === 'router') {
    out.vars = { ...rest.vars, DEPLOY_ENV: 'preview' };
    out.routes = [{ pattern: names.host, custom_domain: true }];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Side effects: the Cloudflare API and wrangler.

const log = (message) => console.log(`[preview] ${message}`);

function account() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !id) throw new Error('preview: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID');
  return { token, id };
}

/** One Cloudflare API call; `allow` lists the HTTP statuses that are an answer rather than a failure. */
async function cf(method, route, { body, allow = [] } = {}) {
  const { token, id } = account();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (allow.includes(res.status)) return { status: res.status, json: null };
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    const errors = json?.errors?.map((e) => `${e.code} ${e.message}`).join('; ') ?? res.statusText;
    throw new Error(`preview: ${method} ${route} answered ${res.status}: ${errors}`);
  }
  return { status: res.status, json };
}

async function workersSubdomain() {
  const { json } = await cf('GET', '/workers/subdomain');
  return json.result.subdomain;
}

async function findDatabase(name) {
  const { json } = await cf('GET', `/d1/database?name=${encodeURIComponent(name)}`);
  return json.result.find((db) => db.name === name)?.uuid ?? null;
}

async function ensureDatabase(name) {
  const existing = await findDatabase(name);
  if (existing) return existing;
  const { json } = await cf('POST', '/d1/database', {
    body: { name, primary_location_hint: LOCATION },
  });
  log(`created D1 ${name}`);
  return json.result.uuid;
}

// Sign-in on a preview needs its own BETTER_AUTH_SECRET, never production's. Made once, when the api worker has
// none, so sessions survive later pushes; it goes with the worker when the preview is torn down.
async function ensureAuthSecret(worker) {
  const { json } = await cf('GET', `/workers/scripts/${worker}/secrets`);
  if (json.result.some((secret) => secret.name === 'BETTER_AUTH_SECRET')) return;
  const text = randomBytes(32).toString('base64');
  await cf('PUT', `/workers/scripts/${worker}/secrets`, {
    body: { name: 'BETTER_AUTH_SECRET', text, type: 'secret_text' },
  });
  log(`set BETTER_AUTH_SECRET on ${worker}`);
}

async function ensureBucket(name) {
  const { status } = await cf('GET', `/r2/buckets/${name}`, { allow: [404] });
  if (status !== 404) return;
  await cf('POST', '/r2/buckets', { body: { name, locationHint: LOCATION } });
  log(`created R2 ${name}`);
}

/** Runs a command with its output streamed live, and kept for the caller to read. */
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ ok: code === 0, output }));
  });
}

// A brand-new worker is briefly invisible to wrangler's workers.dev step, which then fails with
// 10007 even though the upload succeeded (docs/operations/docs-nu.md). Retried while still invisible, a worker with
// Durable Objects is refused 10079 instead: wrangler reads no migration tag, but the first upload stored one. Every
// preview's first deploy creates seven new workers, so only those answers are retried; any other failure stops it.
const NEW_WORKER_RACE =
  /This Worker does not exist on your account\. \[code: 10007\]|Actor migration tag precondition failed, got tag '' when expected tag is '[^']+'\. .*\[code: 10079\]/;
const RACE_ATTEMPTS = 6;
const RACE_PAUSE_MS = 30_000;

async function wranglerDeploy(app, extraArgs) {
  const cwd = path.join(ROOT, 'apps', app);
  for (let attempt = 1; attempt <= RACE_ATTEMPTS; attempt++) {
    const { ok, output } = await run(
      'pnpm',
      ['exec', 'wrangler', 'deploy', '--config', PREVIEW_CONFIG, ...extraArgs],
      cwd,
    );
    if (ok) return;
    if (!NEW_WORKER_RACE.test(output) || attempt === RACE_ATTEMPTS) {
      throw new Error(`preview: deploying ${app} failed (attempt ${attempt})`);
    }
    log(`${app}: new worker not visible yet (attempt ${attempt}), retrying in 30 s`);
    await new Promise((resolve) => setTimeout(resolve, RACE_PAUSE_MS));
  }
}

/** Custom domains on the account, filtered by the API on hostname or worker. */
async function customDomains(filter) {
  const { json } = await cf('GET', `/workers/domains?${new URLSearchParams(filter)}`);
  return json.result;
}

async function detachDomain(domain, why) {
  await cf('DELETE', `/workers/domains/${domain.id}`);
  log(`detached ${domain.hostname} from ${domain.service} (${why})`);
}

// Two branches can share a label (feat/x and feat-x). The second must not take the first one's host.
async function refuseTakenHost(names) {
  const router = `${names.prefix}-router`;
  const taken = (await customDomains({ hostname: names.host })).find((d) => d.service !== router);
  if (taken) {
    throw new Error(
      `preview: ${names.host} already serves ${taken.service}; rename this branch to get a host of its own`,
    );
  }
}

// A host stays attached until removed: after a branch rename, the old one goes.
async function detachStaleHosts(names) {
  const router = `${names.prefix}-router`;
  for (const domain of await customDomains({ service: router })) {
    if (domain.hostname !== names.host) await detachDomain(domain, 'the branch was renamed');
  }
}

// A new custom domain answers once its DNS record exists and its certificate is issued: about four
// minutes when measured. Its DNS is asked of Cloudflare directly first, because a resolver that is asked
// too early caches "no such host" for the zone's negative TTL (1800 s on docs.nu); the system resolver
// is only asked once the record exists, so it never caches the miss.
const HOST_WAIT_MS = 15 * 60_000;
const HOST_POLL_MS = 10_000;
// By address, not by name: networks that filter DNS often block the DoH hostnames themselves.
const DOH = 'https://1.1.1.1/dns-query';

async function hostResolves(host) {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(host)}&type=A`, {
    headers: { accept: 'application/dns-json' },
  }).catch((error) => {
    throw new Error(`preview: DNS over HTTPS at ${DOH} failed: ${describeFetchError(error)}`);
  });
  if (!res.ok) throw new Error(`preview: DNS over HTTPS answered ${res.status} for ${host}`);
  const answer = /** @type {{ Answer?: unknown[] }} */ (await res.json());
  return (answer.Answer?.length ?? 0) > 0;
}

/** "fetch failed" alone hides whether DNS, TLS or the connection failed; the cause names it. */
function describeFetchError(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = /** @type {{ code?: string, message?: string } | undefined} */ (error.cause);
  return cause
    ? `${error.message}: ${cause.code ?? ''} ${cause.message ?? ''}`.trim()
    : error.message;
}

async function waitForHost(host) {
  const origin = `https://${host}`;
  const started = Date.now();
  const deadline = started + HOST_WAIT_MS;
  while (!(await hostResolves(host))) {
    if (Date.now() > deadline)
      throw new Error(`preview: ${host} has no DNS record after 15 minutes`);
    log(`waiting for the DNS record of ${host}`);
    await new Promise((resolve) => setTimeout(resolve, HOST_POLL_MS));
  }
  log(`${host} resolves after ${Math.round((Date.now() - started) / 1000)} s`);
  for (;;) {
    const status = await fetch(`${origin}/api/capabilities`)
      .then((res) => res.status)
      .catch(describeFetchError);
    if (status === 200) {
      log(`${origin} answers after ${Math.round((Date.now() - started) / 1000)} s`);
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`preview: ${origin} still answers ${status} after 15 minutes`);
    }
    log(`waiting for ${origin} (answered ${status})`);
    await new Promise((resolve) => setTimeout(resolve, HOST_POLL_MS));
  }
}

async function deploy(pr, branch) {
  const names = previewNames(pr, await workersSubdomain(), branch);
  await refuseTakenHost(names);
  const d1Id = await ensureDatabase(names.d1);
  await ensureBucket(names.bucket);
  for (const app of PREVIEW_APPS) {
    const source = parse(readFileSync(path.join(ROOT, 'apps', app, 'wrangler.toml'), 'utf8'));
    const config = previewConfig(source, { app, names, d1Id });
    writeFileSync(
      path.join(ROOT, 'apps', app, PREVIEW_CONFIG),
      `${JSON.stringify(config, null, 2)}\n`,
    );
  }
  log(`applying D1 migrations to ${names.d1}`);
  const migrated = await run(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', PREVIEW_CONFIG],
    path.join(ROOT, 'apps', 'api'),
  );
  if (!migrated.ok) throw new Error('preview: D1 migrations failed');
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID;
  for (const app of PREVIEW_APPS) {
    log(`deploying ${app}`);
    await wranglerDeploy(app, app === 'api' && buildId ? ['--var', `BUILD_ID:${buildId}`] : []);
    if (app === 'api') await ensureAuthSecret(previewWorker('docs-nu-api', names.prefix));
  }
  await detachStaleHosts(names);
  log(`deployed: ${names.workersDevOrigin}, and ${names.origin} once its certificate is issued`);
  console.log(`PREVIEW_URL=${names.origin}`);
}

async function waitHost(pr, branch) {
  const names = previewNames(pr, await workersSubdomain(), branch);
  await waitForHost(names.host);
  console.log(`PREVIEW_URL=${names.origin}`);
}

async function emptyBucket(name) {
  let cursor = '';
  let removed = 0;
  do {
    const query = `per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { json } = await cf('GET', `/r2/buckets/${name}/objects?${query}`);
    for (const object of json.result) {
      await cf('DELETE', `/r2/buckets/${name}/objects/${encodeURIComponent(object.key)}`);
      removed++;
    }
    cursor = json.result_info?.is_truncated ? json.result_info.cursor : '';
  } while (cursor);
  return removed;
}

async function teardown(pr) {
  const names = previewResources(pr);
  // Reverse order: nothing still binds a worker when it goes.
  for (const app of [...PREVIEW_APPS].reverse()) {
    const worker = `${names.prefix}-${app}`;
    for (const domain of await customDomains({ service: worker })) {
      await detachDomain(domain, 'the pull request closed');
    }
    const { status } = await cf('DELETE', `/workers/scripts/${worker}?force=true`, {
      allow: [404],
    });
    log(status === 404 ? `${worker} already gone` : `deleted worker ${worker}`);
  }
  const d1Id = await findDatabase(names.d1);
  if (d1Id) {
    await cf('DELETE', `/d1/database/${d1Id}`);
    log(`deleted D1 ${names.d1}`);
  } else log(`D1 ${names.d1} already gone`);
  const { status } = await cf('GET', `/r2/buckets/${names.bucket}`, { allow: [404] });
  if (status === 404) log(`R2 ${names.bucket} already gone`);
  else {
    const removed = await emptyBucket(names.bucket);
    await cf('DELETE', `/r2/buckets/${names.bucket}`);
    log(`deleted R2 ${names.bucket} (${removed} objects)`);
  }
}

/** Fills (or, with null, empties) the preview slot of the pull request's description. */
async function describe(pr, line) {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) throw new Error('preview: set GITHUB_TOKEN and GITHUB_REPOSITORY');
  const outcome = await writeSlot({ repository, token, pr, name: 'preview', content: line });
  log(`#${pr} description: preview slot ${outcome}`);
}

async function main([command, ...args]) {
  switch (command) {
    case 'deploy': {
      const [pr, branch] = args;
      return deploy(prNumber(pr), branch);
    }
    case 'wait-host': {
      const [pr, branch] = args;
      return waitHost(prNumber(pr), branch);
    }
    case 'link': {
      const [pr, sha, branch] = args;
      return describe(prNumber(pr), previewLine(sha ?? '', branch));
    }
    case 'unlink':
      return describe(prNumber(args[0]), null);
    case 'teardown':
      return teardown(prNumber(args[0]));
    default:
      throw new Error(
        'usage: node scripts/preview.mjs deploy <pr> <branch> | wait-host <pr> <branch> | link <pr> <sha> <branch> | unlink <pr> | teardown <pr>',
      );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
