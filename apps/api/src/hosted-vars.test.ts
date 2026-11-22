import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePositiveCap } from './routes/images';

// The hosted profile (docs/specs/016-platform/deployment.md "Hosted profile"):
// the vars docs.nu's own deploys add, and a fork's do not. Two promises
// hang on it: a fork deploying the repo as documented is telemetry-off and
// uncapped, and the hosted deployment's image caps survive every deploy.

type Profile = {
  shared: Record<string, string>;
  environments: Record<string, Record<string, string>>;
};

interface HostedVarsModule {
  HOSTED_VARS_PATH: string;
  readHostedProfile: (path?: string) => Profile;
  hostedEnvironment: (wranglerEnv: string, profile: Profile) => string;
  resolveHostedVars: (
    profile: Profile,
    environment: string,
  ) => { vars: Record<string, string>; unset: string[] };
  splitEnvArg: (args: string[]) => { wranglerEnv: string; rest: string[] };
  unsetVarDrift: (
    unset: string[],
    deployed: Map<string, string>,
  ) => { name: string; expected: string; actual: string | null }[];
  clientIdBuildDrift: (texts: string[], expected: string | null, others: string[]) => string[];
  wranglerVarFlags: (vars: Record<string, string>) => string[];
  buildEnv: (vars: Record<string, string>) => string[];
  activeVersionIds: (status: unknown) => string[];
  VERSION_READ_WAITS_MS: readonly number[];
  isVersionNotYetReadable: (error: unknown) => boolean;
  readFreshVersion: <T>(
    read: () => T,
    options: {
      waitsMs: readonly number[];
      sleep: (ms: number) => void;
      log: (line: string) => void;
    },
  ) => T;
  plainVars: (view: unknown) => Map<string, string>;
  hostedVarDrift: (
    expected: Record<string, string>,
    deployed: Map<string, string>,
  ) => { name: string; expected: string; actual: string | null }[];
}

// Computed URL so tsc doesn't try to resolve the untyped build script.
const scriptUrl = new URL('../scripts/hosted-vars.mjs', import.meta.url).href;
const load = async () => (await import(scriptUrl)) as HostedVarsModule;

const readApiFile = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url).href), 'utf8');

/** The `KEY = ...` names declared directly under one wrangler.toml table header. */
function tomlTableKeys(toml: string, header: string): string[] {
  const lines = toml.split('\n');
  const start = lines.findIndex((l) => l.trim() === `[${header}]`);
  if (start < 0) return [];
  const keys: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith('[')) break;
    const m = /^([A-Z][A-Z0-9_]*)\s*=/.exec(line.trim());
    if (m) keys.push(m[1]!);
  }
  return keys;
}

describe('hosted profile', () => {
  it('turns telemetry on, caps every owner gallery and links emails to docs.nu', async () => {
    const { shared: vars, environments } = (await load()).readHostedProfile();
    expect(environments.production!.APP_BASE_URL).toBe('https://docs.nu');
    expect(vars.TELEMETRY_ENABLED).toBe('true');
    // The worker's own parser: a value it reads as "no cap" would leave R2
    // unguarded while this file looked right.
    expect(parsePositiveCap(vars.IMAGE_MAX_PER_OWNER)).toBe(100);
    expect(parsePositiveCap(vars.IMAGE_MAX_BYTES_PER_OWNER)).toBe(100 * 1024 * 1024);
    // The blob store's allowance (docs/specs/006-document/blob-store.md "Getting bytes in").
    expect(parsePositiveCap(vars.FILE_MAX_BYTES_PER_OWNER)).toBe(1024 * 1024 * 1024);
  });

  it('names only vars the worker reads', async () => {
    const types = readApiFile('src/types.ts');
    const { shared, environments } = (await load()).readHostedProfile();
    const names = [...Object.keys(shared), ...Object.keys(environments.production!)];
    for (const name of names) {
      expect(types, `${name} is not on Env`).toMatch(new RegExp(`\\b${name}\\?: string;`));
    }
  });

  it('is never a committed default, so a fork is telemetry-off and uncapped', async () => {
    const { shared, environments } = (await load()).readHostedProfile();
    const hosted = [
      ...Object.keys(shared),
      ...Object.values(environments).flatMap((vars) => Object.keys(vars)),
    ];
    const toml = readApiFile('wrangler.toml');
    const varTables = [...toml.matchAll(/^\[((?:env\.[\w-]+\.)?vars)\]$/gm)].map((m) => m[1]!);
    expect(varTables).toContain('vars');
    for (const table of varTables) {
      const declared = tomlTableKeys(toml, table).filter((k) => hosted.includes(k));
      expect(declared, `[${table}] declares hosted-only vars`).toEqual([]);
    }
    // Vacuity guard: the table reader must still see what IS committed.
    expect(tomlTableKeys(toml, 'vars')).toContain('AI_ALLOWED_ORIGINS');
  });
});

describe('hosted-vars script', () => {
  it('renders one --var pair per hosted var', async () => {
    const { wranglerVarFlags } = await load();
    expect(wranglerVarFlags({ A: '1', B: 'x:y' })).toEqual(['--var', 'A:1', '--var', 'B:x:y']);
  });

  it('mirrors telemetry into the frontend build, and nothing when it is off', async () => {
    const { buildEnv } = await load();
    expect(buildEnv({ TELEMETRY_ENABLED: 'true', IMAGE_MAX_PER_OWNER: '1' })).toEqual([
      'NEXT_PUBLIC_TELEMETRY_ENABLED=true',
    ]);
    expect(buildEnv({ IMAGE_MAX_PER_OWNER: '1' })).toEqual([]);
  });

  it('hands the Google client id to the frontends (docs/specs/022-drive-mirror/drive-mirror.md)', async () => {
    const { buildEnv } = await load();
    expect(buildEnv({ GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com' })).toEqual([
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID=123-abc.apps.googleusercontent.com',
    ]);
  });

  it('rejects a malformed profile rather than deploying half of it', async () => {
    const { readHostedProfile: readHostedVars } = await load();
    const dir = mkdtempSync(join(tmpdir(), 'hosted-vars-'));
    const write = (body: string) => {
      const path = join(dir, 'vars.json');
      writeFileSync(path, body);
      return path;
    };
    expect(() => readHostedVars(write('[]'))).toThrow(/JSON object/);
    expect(() => readHostedVars(write('{"lower": "1"}'))).toThrow(/invalid var name/);
    expect(() => readHostedVars(write('{"CAP": 100}'))).toThrow(/non-empty string/);
    expect(() => readHostedVars(write('{"CAP": ""}'))).toThrow(/non-empty string/);
    const envs = (production: unknown, preview: unknown) =>
      write(
        `{"CAP": "1", "environments": {"production": ${JSON.stringify(production)}, "preview": ${JSON.stringify(preview)}}}`,
      );
    expect(() => readHostedVars(write('{"environments": {"preview": {}}}'))).toThrow(
      /must hold production/,
    );
    expect(() => readHostedVars(write('{"environments": []}'))).toThrow(/must hold production/);
    expect(readHostedVars(write('{"environments": {"production": {"A": "x"}}}'))).toEqual({
      shared: {},
      environments: { production: { A: 'x' } },
    });
    expect(readHostedVars(write('{"CAP": "1"}'))).toEqual({
      shared: { CAP: '1' },
      environments: { production: {} },
    });
    expect(() => readHostedVars(envs({ A: '' }, { B: '' }))).toThrow(/same names/);
    expect(() => readHostedVars(envs({ CAP: '' }, { CAP: '' }))).toThrow(/also shared/);
    expect(() => readHostedVars(envs({ A: 1 }, { A: '' }))).toThrow(/string/);
    expect(() => readHostedVars(envs({ a: '' }, { a: '' }))).toThrow(/invalid var name/);
    expect(readHostedVars(envs({ A: 'x' }, { A: '' }))).toEqual({
      shared: { CAP: '1' },
      environments: { production: { A: 'x' }, preview: { A: '' } },
    });
  });

  // Shapes as `wrangler deployments status --json` / `versions view --json`
  // print them (wrangler 4).
  const status = {
    versions: [
      { version_id: 'v-new', percentage: 100 },
      { version_id: 'v-old', percentage: 0 },
    ],
  };
  const view = {
    resources: {
      bindings: [
        { type: 'plain_text', name: 'TELEMETRY_ENABLED', text: 'true' },
        { type: 'plain_text', name: 'IMAGE_MAX_PER_OWNER', text: '50' },
        { type: 'secret_text', name: 'BETTER_AUTH_SECRET' },
        { type: 'd1', name: 'DB' },
      ],
    },
  };

  it('verifies only the versions serving traffic', async () => {
    const { activeVersionIds } = await load();
    expect(activeVersionIds(status)).toEqual(['v-new']);
    expect(activeVersionIds({})).toEqual([]);
  });

  describe('a version just deployed', () => {
    // docs/specs/016-platform/deployment.md "A version just deployed"
    const notFound = Object.assign(new Error('Command failed'), {
      stderr: 'The requested Worker version could not be found [code: 100146]',
    });

    it('reads the version again until Cloudflare can return it', async () => {
      const { readFreshVersion } = await load();
      const slept: number[] = [];
      const logged: string[] = [];
      let calls = 0;
      const view = readFreshVersion(
        () => {
          calls += 1;
          if (calls < 3) throw notFound;
          return { id: 'v-new' };
        },
        { waitsMs: [1, 2, 4], sleep: (ms) => slept.push(ms), log: (l) => logged.push(l) },
      );
      expect(view).toEqual({ id: 'v-new' });
      expect(slept).toEqual([1, 2]);
      expect(logged).toHaveLength(2);
      expect(logged[0]).toContain('not yet readable');
    });

    it('fails after the last wait', async () => {
      const { readFreshVersion } = await load();
      const slept: number[] = [];
      expect(() =>
        readFreshVersion(
          () => {
            throw notFound;
          },
          { waitsMs: [1, 2], sleep: (ms) => slept.push(ms), log: () => {} },
        ),
      ).toThrow(notFound);
      expect(slept).toEqual([1, 2]);
    });

    it('never retries another error', async () => {
      const { readFreshVersion } = await load();
      const other = Object.assign(new Error('Command failed'), {
        stderr: 'Authentication error [code: 10000]',
      });
      const slept: number[] = [];
      expect(() =>
        readFreshVersion(
          () => {
            throw other;
          },
          { waitsMs: [1], sleep: (ms) => slept.push(ms), log: () => {} },
        ),
      ).toThrow(other);
      expect(slept).toEqual([]);
    });

    it('waits about half a minute in all, doubling', async () => {
      const { VERSION_READ_WAITS_MS, isVersionNotYetReadable } = await load();
      expect(VERSION_READ_WAITS_MS).toEqual([1000, 2000, 4000, 8000, 16000]);
      expect(isVersionNotYetReadable(notFound)).toBe(true);
      expect(isVersionNotYetReadable(new Error('code: 100146 in the message'))).toBe(false);
      expect(isVersionNotYetReadable(null)).toBe(false);
    });
  });

  it('reports every hosted var a deployment lacks or holds with another value', async () => {
    const { hostedVarDrift, plainVars } = await load();
    const drift = hostedVarDrift(
      { TELEMETRY_ENABLED: 'true', IMAGE_MAX_PER_OWNER: '100', IMAGE_MAX_BYTES_PER_OWNER: '9' },
      plainVars(view),
    );
    expect(drift).toEqual([
      { name: 'IMAGE_MAX_PER_OWNER', expected: '100', actual: '50' },
      { name: 'IMAGE_MAX_BYTES_PER_OWNER', expected: '9', actual: null },
    ]);
    expect(hostedVarDrift({ TELEMETRY_ENABLED: 'true' }, plainVars(view))).toEqual([]);
    expect(plainVars({}).size).toBe(0);
  });
});

// The Drive mirror's Google identity is per environment: each environment is its own
// Google Cloud project (docs/specs/022-drive-mirror/drive-mirror.md, "Hosted deployment").
// `preview` stands in for any environment beside production.
describe('hosted profile per environment', () => {
  const profile: Profile = {
    shared: { TELEMETRY_ENABLED: 'true' },
    environments: {
      production: { GOOGLE_CLIENT_ID: '111-prod.apps.googleusercontent.com' },
      preview: { GOOGLE_CLIENT_ID: '222-preview.apps.googleusercontent.com' },
    },
  };

  it('names the environment by the wrangler env, and refuses any other', async () => {
    const { hostedEnvironment } = await load();
    expect(hostedEnvironment('', profile)).toBe('production');
    expect(hostedEnvironment('preview', profile)).toBe('preview');
    expect(() => hostedEnvironment('prod', profile)).toThrow(/unknown environment/);
    // Production is the unnamed wrangler env; naming it would deploy a second production.
    expect(() => hostedEnvironment('production', profile)).toThrow(/unknown environment/);
  });

  it('reads --env off the command line and leaves the rest for wrangler', async () => {
    const { splitEnvArg } = await load();
    expect(splitEnvArg([])).toEqual({ wranglerEnv: '', rest: [] });
    expect(splitEnvArg(['--env', 'preview', 'out'])).toEqual({
      wranglerEnv: 'preview',
      rest: ['out'],
    });
  });

  it("resolves each environment's own client id, shared vars beside it", async () => {
    const { resolveHostedVars } = await load();
    expect(resolveHostedVars(profile, 'preview')).toEqual({
      vars: {
        TELEMETRY_ENABLED: 'true',
        GOOGLE_CLIENT_ID: '222-preview.apps.googleusercontent.com',
      },
      unset: [],
    });
    expect(resolveHostedVars(profile, 'production').vars.GOOGLE_CLIENT_ID).toBe(
      '111-prod.apps.googleusercontent.com',
    );
  });

  it('leaves an empty entry unset: no --var, no build twin, so the mirror stays off', async () => {
    const { resolveHostedVars, wranglerVarFlags, buildEnv } = await load();
    const empty: Profile = {
      ...profile,
      environments: { ...profile.environments, preview: { GOOGLE_CLIENT_ID: '' } },
    };
    const { vars, unset } = resolveHostedVars(empty, 'preview');
    expect(unset).toEqual(['GOOGLE_CLIENT_ID']);
    expect(wranglerVarFlags(vars)).toEqual(['--var', 'TELEMETRY_ENABLED:true']);
    expect(buildEnv(vars)).toEqual(['NEXT_PUBLIC_TELEMETRY_ENABLED=true']);
  });

  it('gives the worker and the live build of one environment the same client id', async () => {
    const { resolveHostedVars, wranglerVarFlags, buildEnv } = await load();
    for (const env of ['production', 'preview']) {
      const { vars } = resolveHostedVars(profile, env);
      const id = profile.environments[env]!.GOOGLE_CLIENT_ID;
      expect(wranglerVarFlags(vars)).toContain(`GOOGLE_CLIENT_ID:${id}`);
      expect(buildEnv(vars)).toContain(`NEXT_PUBLIC_GOOGLE_CLIENT_ID=${id}`);
    }
  });

  it('verify fails when a deployment still holds a var this environment leaves unset', async () => {
    const { unsetVarDrift } = await load();
    const deployed = new Map([['GOOGLE_CLIENT_ID', '111-prod.apps.googleusercontent.com']]);
    expect(unsetVarDrift(['GOOGLE_CLIENT_ID'], deployed)).toEqual([
      {
        name: 'GOOGLE_CLIENT_ID',
        expected: '(unset)',
        actual: '111-prod.apps.googleusercontent.com',
      },
    ]);
    expect(unsetVarDrift(['GOOGLE_CLIENT_ID'], new Map())).toEqual([]);
  });

  it("verify-build finds the environment's client id in the live build, and never another's", async () => {
    const { clientIdBuildDrift } = await load();
    const prod = '111-prod.apps.googleusercontent.com';
    const preview = '222-preview.apps.googleusercontent.com';
    expect(clientIdBuildDrift(['a', `x"${preview}"y`], preview, [prod])).toEqual([]);
    expect(clientIdBuildDrift(['a'], preview, [prod])).toEqual([`missing ${preview}`]);
    expect(clientIdBuildDrift([`${preview} ${prod}`], preview, [prod])).toEqual([
      `holds another environment's ${prod}`,
    ]);
    // Unset here: no client id may be baked in at all.
    expect(clientIdBuildDrift([prod], null, [prod])).toEqual([
      `holds another environment's ${prod}`,
    ]);
    expect(clientIdBuildDrift(['nothing'], null, [prod])).toEqual([]);
  });
});
