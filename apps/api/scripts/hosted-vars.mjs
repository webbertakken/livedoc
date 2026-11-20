// The hosted profile (docs/specs/016-platform/deployment.md "Hosted profile"): the
// plain vars docs.nu's own deploys add on top of wrangler.toml, and a
// fork's do not. They live in `hosted-vars.json`, not in `[vars]`, because a
// committed `[vars]` value is every fork's default too; and not in the
// Cloudflare dashboard, because `wrangler deploy` replaces a worker's plain
// vars with whatever the deploy declares, silently wiping dashboard-only ones.
//
// Most hosted vars are shared by every environment; a few are per environment
// under `environments`: the public origin and the Google Drive mirror's OAuth
// client id, because each environment is its own Google Cloud project
// (docs/specs/022-drive-mirror/drive-mirror.md, "Hosted deployment").
// `production` is required and is the unnamed wrangler env; any other entry is
// the wrangler env of the same name. Every environment declares the same names.
// An empty per-environment value means unset there: the feature stays off.
//
// Run from apps/api; `--env <name>` picks that environment, none picks production:
//
//   node scripts/hosted-vars.mjs flags [--env <name>]
//       One token per line (`--var`, `KEY:VALUE`, ...) for `wrangler deploy`.
//   node scripts/hosted-vars.mjs build-env [--env <name>]
//       The frontends' build-time mirror, as `KEY=VALUE` lines for $GITHUB_ENV.
//   node scripts/hosted-vars.mjs verify [--env <name>] [wrangler args...]
//       Exits non-zero unless the worker's live deployment carries every hosted
//       var of the environment with its value, and none it leaves unset. The
//       args, `--env` included, reach wrangler.
//   node scripts/hosted-vars.mjs verify-build <dir> [--env <name>]
//       Exits non-zero unless the built live app in <dir> carries the
//       environment's Google client id (when set) and no other environment's,
//       so the api and the live build of one environment agree.
//
// The pure helpers are exported for src/hosted-vars.test.ts.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOSTED_VARS_PATH = fileURLToPath(new URL('../hosted-vars.json', import.meta.url));

const VAR_NAME = /^[A-Z][A-Z0-9_]*$/;
const PRODUCTION = 'production';

/** Reads and validates the profile: shared NAME → non-empty string, plus
 *  `environments` holding production and any others, each declaring the same
 *  names (none of them also shared), whose values are strings, empty = unset. */
export function readHostedProfile(path = HOSTED_VARS_PATH) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`hosted-vars: ${path} must hold a JSON object`);
  }
  const { environments: rawEnvs, ...shared } = raw;
  for (const [name, value] of Object.entries(shared)) {
    if (!VAR_NAME.test(name)) throw new Error(`hosted-vars: invalid var name ${name}`);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`hosted-vars: ${name} must be a non-empty string`);
    }
  }
  if (rawEnvs === undefined) return { shared, environments: { [PRODUCTION]: {} } };
  const names =
    rawEnvs && typeof rawEnvs === 'object' && !Array.isArray(rawEnvs) ? Object.keys(rawEnvs) : [];
  if (!names.includes(PRODUCTION)) {
    throw new Error('hosted-vars: environments must hold production');
  }
  /** @type {Record<string, Record<string, string>>} */
  const environments = {};
  for (const env of names) {
    const vars = rawEnvs[env];
    if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
      throw new Error(`hosted-vars: environments.${env} must be an object`);
    }
    for (const [name, value] of Object.entries(vars)) {
      if (!VAR_NAME.test(name)) throw new Error(`hosted-vars: invalid var name ${name}`);
      if (typeof value !== 'string')
        throw new Error(`hosted-vars: ${env}.${name} must be a string`);
      if (name in shared)
        throw new Error(`hosted-vars: ${name} is per environment and also shared`);
    }
    environments[env] = vars;
  }
  const keys = (env) => Object.keys(environments[env]).sort().join();
  for (const env of names) {
    if (keys(env) !== keys(PRODUCTION)) {
      throw new Error(`hosted-vars: ${env} and production must declare the same names`);
    }
  }
  return { shared, environments };
}

/** The profile environment a wrangler env deploys: none is production, and
 *  any other must be declared. Naming production would be a second production. */
export function hostedEnvironment(wranglerEnv, profile) {
  if (wranglerEnv === '') return PRODUCTION;
  if (wranglerEnv !== PRODUCTION && wranglerEnv in profile.environments) return wranglerEnv;
  throw new Error(`hosted-vars: unknown environment ${wranglerEnv}`);
}

/** Shared vars plus the environment's set ones, and the names it leaves unset. */
export function resolveHostedVars(profile, environment) {
  const own = profile.environments[environment] ?? {};
  const vars = { ...profile.shared };
  const unset = [];
  for (const [name, value] of Object.entries(own)) {
    if (value === '') unset.push(name);
    else vars[name] = value;
  }
  return { vars, unset };
}

/** `--env <name>` off the arguments; the rest stay as given. */
export function splitEnvArg(args) {
  const at = args.indexOf('--env');
  if (at < 0) return { wranglerEnv: '', rest: [...args] };
  return { wranglerEnv: args[at + 1] ?? '', rest: [...args.slice(0, at), ...args.slice(at + 2)] };
}

/** `{ A: '1' }` → `['--var', 'A:1']`. Wrangler splits each pair on its first colon. */
export function wranglerVarFlags(vars) {
  return Object.entries(vars).flatMap(([name, value]) => ['--var', `${name}:${value}`]);
}

/** The build-time twins of hosted worker vars: each frontend reads
 *  NEXT_PUBLIC_TELEMETRY_ENABLED to skip emitting when the api would drop it,
 *  and the live app reads NEXT_PUBLIC_GOOGLE_CLIENT_ID for the Drive mirror
 *  (docs/specs/022-drive-mirror/drive-mirror.md), the same client id the api holds. */
export function buildEnv(vars) {
  const out = [];
  if (vars.TELEMETRY_ENABLED) out.push(`NEXT_PUBLIC_TELEMETRY_ENABLED=${vars.TELEMETRY_ENABLED}`);
  if (vars.GOOGLE_CLIENT_ID) out.push(`NEXT_PUBLIC_GOOGLE_CLIENT_ID=${vars.GOOGLE_CLIENT_ID}`);
  return out;
}

/** Version ids serving traffic, from `wrangler deployments status --json`. */
export function activeVersionIds(status) {
  const versions = Array.isArray(status?.versions) ? status.versions : [];
  return versions.filter((v) => v.percentage > 0).map((v) => v.version_id);
}

/** Plain-text vars bound to one version, from `wrangler versions view --json`. */
export function plainVars(view) {
  const bindings = Array.isArray(view?.resources?.bindings) ? view.resources.bindings : [];
  return new Map(
    bindings.filter((b) => b.type === 'plain_text').map((b) => [b.name, String(b.text)]),
  );
}

/** Every var this environment leaves unset that the deployed version still holds. */
export function unsetVarDrift(unset, deployed) {
  return unset
    .filter((name) => deployed.has(name))
    .map((name) => ({ name, expected: '(unset)', actual: deployed.get(name) }));
}

/** What is wrong with a live build's Google client id: the environment's id
 *  missing (when it has one), or another environment's id present. */
export function clientIdBuildDrift(texts, expected, others) {
  const problems = [];
  if (expected && !texts.some((t) => t.includes(expected))) problems.push(`missing ${expected}`);
  for (const other of others) {
    if (other && other !== expected && texts.some((t) => t.includes(other))) {
      problems.push(`holds another environment's ${other}`);
    }
  }
  return problems;
}

/** Every hosted var the deployed version lacks or holds with a different value. */
export function hostedVarDrift(expected, deployed) {
  return Object.entries(expected)
    .filter(([name, value]) => deployed.get(name) !== value)
    .map(([name, value]) => ({ name, expected: value, actual: deployed.get(name) ?? null }));
}

/** Waits between reads of a version Cloudflare cannot return yet: doubling, about 31 s in all.
 *  A just-deployed version can answer "not found" for several seconds after its deploy. */
export const VERSION_READ_WAITS_MS = [1000, 2000, 4000, 8000, 16000];

const VERSION_NOT_FOUND = 'code: 100146';

/** Whether a failed wrangler call is Cloudflare's "version not found", read off its stderr. */
export function isVersionNotYetReadable(error) {
  return typeof error?.stderr === 'string' && error.stderr.includes(VERSION_NOT_FOUND);
}

/** read(), again after each wait while Cloudflare cannot return the version yet; any other error
 *  throws at once, and the last "not found" throws after the last wait. */
export function readFreshVersion(read, { waitsMs, sleep, log }) {
  for (const waitMs of waitsMs) {
    try {
      return read();
    } catch (error) {
      if (!isVersionNotYetReadable(error)) throw error;
      log(`hosted-vars verify: version not yet readable, reading again in ${waitMs} ms`);
      sleep(waitMs);
    }
  }
  return read();
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function wranglerJson(args) {
  const run = spawnSync('pnpm', ['exec', 'wrangler', ...args, '--json'], { encoding: 'utf8' });
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.error) throw run.error;
  if (run.status !== 0) {
    throw Object.assign(new Error(`wrangler ${args.join(' ')} exited ${run.status}`), {
      stderr: run.stderr,
    });
  }
  return JSON.parse(run.stdout);
}

function verify(args) {
  const { wranglerEnv } = splitEnvArg(args);
  const profile = readHostedProfile();
  const { vars: expected, unset } = resolveHostedVars(
    profile,
    hostedEnvironment(wranglerEnv, profile),
  );
  const wranglerArgs = args;
  const versionIds = activeVersionIds(wranglerJson(['deployments', 'status', ...wranglerArgs]));
  if (versionIds.length === 0) {
    console.error('hosted-vars verify: FAILED, no version is serving traffic');
    return 1;
  }
  let failed = false;
  for (const id of versionIds) {
    const view = readFreshVersion(() => wranglerJson(['versions', 'view', id, ...wranglerArgs]), {
      waitsMs: VERSION_READ_WAITS_MS,
      sleep: sleepSync,
      log: (line) => console.error(line),
    });
    const deployed = plainVars(view);
    const drift = [...hostedVarDrift(expected, deployed), ...unsetVarDrift(unset, deployed)];
    for (const d of drift) {
      console.error(
        `hosted-vars verify: FAILED, version ${id} has ${d.name}=${d.actual ?? '(unset)'}, expected ${d.expected}`,
      );
    }
    failed ||= drift.length > 0;
  }
  if (failed) return 1;
  console.log(
    `hosted-vars verify: ok, ${Object.keys(expected).join(', ')} live on ${versionIds.join(', ')}`,
  );
  return 0;
}

/** Every text file under dir (the static live build: html, js, json, txt). */
function buildTexts(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...buildTexts(full));
    else if (/\.(html|js|json|txt)$/.test(entry)) out.push(readFileSync(full, 'utf8'));
  }
  return out;
}

function verifyBuild(args) {
  const { wranglerEnv, rest } = splitEnvArg(args);
  const [dir] = rest;
  if (!dir) {
    console.error('usage: hosted-vars.mjs verify-build <dir> [--env <name>]');
    return 2;
  }
  const profile = readHostedProfile();
  const environment = hostedEnvironment(wranglerEnv, profile);
  const expected = profile.environments[environment].GOOGLE_CLIENT_ID || null;
  const others = Object.keys(profile.environments)
    .filter((e) => e !== environment)
    .map((e) => profile.environments[e].GOOGLE_CLIENT_ID ?? '');
  const problems = clientIdBuildDrift(buildTexts(dir), expected, others);
  for (const p of problems)
    console.error(`hosted-vars verify-build (${environment}): FAILED, ${p}`);
  if (problems.length > 0) return 1;
  console.log(
    `hosted-vars verify-build (${environment}): ok, Google client id ${expected ?? 'unset'}`,
  );
  return 0;
}

function resolvedFor(args) {
  const profile = readHostedProfile();
  return resolveHostedVars(profile, hostedEnvironment(splitEnvArg(args).wranglerEnv, profile));
}

function main([command, ...rest]) {
  switch (command) {
    case 'flags':
      console.log(wranglerVarFlags(resolvedFor(rest).vars).join('\n'));
      return 0;
    case 'build-env':
      console.log(buildEnv(resolvedFor(rest).vars).join('\n'));
      return 0;
    case 'verify':
      return verify(rest);
    case 'verify-build':
      return verifyBuild(rest);
    default:
      console.error(
        'usage: hosted-vars.mjs flags | build-env | verify | verify-build <dir>  [--env <name>]',
      );
      return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
