import { defineConfig, devices } from '@playwright/test';

// E2E smoke suite (docs/specs/003-system-architecture/e2e-smoke.md). Chromium only; deliberately small. Runs
// against the real production build + api worker (scripts/e2e-stack.mjs),
// or a developer's already-running `pnpm dev` stack when one is up
// (reuseExistingServer below).
const isCI = !!process.env.CI;
const CI_WORKERS = 4;

// The runs that need a stack of their own, each selected by its script and booted on its own ports, so a
// guest stack already up on :4002 (or another run's) is never mistaken for it. Every one serves the same
// `out/` export: sign-in is the api's answer at runtime, so a signed-in run differs only in its stack.
type OwnStack = {
  name: string;
  // `google`: the port the fake Google listens on, which turns sign-in with Google on (E2E_GOOGLE_PORT).
  ports: { live: string; api: string; marketing: string; google?: string };
  // Sign-in on, email codes in the outbox (E2E_SIGN_IN, e2e-smoke.md "Signed-in specs").
  signIn: boolean;
};
const OWN_STACKS: Record<string, OwnStack> = {
  // `pnpm test:e2e:account`: the signed-in specs in e2e/account/ (docs/specs/014-identity/).
  account: {
    name: 'account',
    ports: { live: '3015', api: '8788', marketing: '3016', google: '8797' },
    signIn: true,
  },
  // `pnpm test:e2e:armed`: the entry paths of a first-time guest under enforced guest signatures
  // (e2e-smoke.md "Armed guest signatures"), on a guest-only stack.
  armed: { name: 'armed', ports: { live: '3017', api: '8789', marketing: '3018' }, signIn: false },
  // `pnpm test:e2e:workbench`: the workbench embed (docs/specs/013-workspace/workbench-embeds.md
  // "Testing"), whose pairing page and CLI calls need an account.
  workbench: {
    name: 'workbench',
    ports: { live: '3021', api: '8791', marketing: '3022' },
    signIn: true,
  },
  // `pnpm test:e2e:drive`: the Google Drive mirror against the fake Google
  // (docs/specs/022-drive-mirror/drive-mirror.md), which needs an account.
  drive: { name: 'drive', ports: { live: '3023', api: '8792', marketing: '3024' }, signIn: true },
};
const account = process.env.E2E_ACCOUNT === '1';
const armed = process.env.E2E_GUEST_SIG_ENFORCE === '1';
const workbench = process.env.E2E_WORKBENCH === '1';
const drive = process.env.E2E_DRIVE === '1';
const ownStack = account
  ? OWN_STACKS.account
  : armed
    ? OWN_STACKS.armed
    : workbench
      ? OWN_STACKS.workbench
      : drive
        ? OWN_STACKS.drive
        : null;
const BASE_URL =
  process.env.E2E_BASE_URL ??
  (ownStack ? `http://localhost:${ownStack.ports.live}` : 'http://localhost:4002');
// The guest budget run (`test:e2e:budget`) keeps its own report and results beside a smoke shard's in the same job.
const budgetRun = process.env.E2E_BUDGET === '1';
const runName = ownStack ? `-${ownStack.name}` : budgetRun ? '-budget' : '';
// The guest specs that time the app against a wall-clock budget (docs/specs/003-system-architecture/e2e-smoke.md
// "Timing budgets"): the `budget` project's alone, never a smoke shard's.
const GUEST_TIMING_BUDGETS = /\/e2e\/new-document-open-budget\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  // Playwright runs the `.spec.ts` files; the `.test.ts` beside them are Vitest unit tests of pure helpers
  // (vitest.config.ts excludes `e2e/**/*.spec.ts`, the other half of this split).
  testMatch: /\.spec\.ts$/,
  // Each invocation keeps its own artefacts: a run clears its output folder when it starts.
  outputDir: `test-results${runName}`,
  // The whole point is the smoke alarm, not a slow exhaustive suite:
  // fail fast rather than burn CI minutes on a hung run.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Every test opens a fresh browser context, so a fresh guest owner with its own documents; tests
  // share the stack but never its data, and run in parallel everywhere. CI pins one worker per
  // vCPU of the GitHub runner.
  fullyParallel: true,
  workers: isCI ? CI_WORKERS : undefined,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Each invocation keeps its own report, so the signed-in run never overwrites the smoke suite's.
  reporter: isCI
    ? [
        ['github'],
        ['list'],
        [
          'html',
          {
            open: 'never',
            outputFolder: `playwright-report${runName}`,
          },
        ],
      ]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: isCI ? 'retain-on-first-failure' : 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // The Drive, signed-in, workbench and sites suites need their own stacks or builds; see below.
      testIgnore: [
        /drive-(mirror|shots)\.spec\.ts/,
        /account\//,
        /armed\//,
        /perf\//,
        /optical-audit-sites\.spec\.ts/,
        /workbench-(embed|workspace)\.spec\.ts/,
        GUEST_TIMING_BUDGETS,
      ],
    },
    // A budget times the app, not the runner (docs/specs/003-system-architecture/e2e-smoke.md "Timing budgets"): the
    // guest budgets run once every smoke spec has finished, one test at a time, so no other browser shares the CPU
    // while they measure. CI runs them on their own (`test:e2e:budget`, --no-deps) after a smoke shard.
    {
      name: 'budget',
      use: { ...devices['Desktop Chrome'] },
      testMatch: GUEST_TIMING_BUDGETS,
      dependencies: ['chromium'],
      fullyParallel: false,
    },
    // The optical audit of the help centre, telemetry dashboard and marketing site: the one suite
    // that needs their builds, so CI gives it its own job and the shards build only live
    // (docs/specs/003-system-architecture/e2e-smoke.md "When it runs").
    {
      name: 'sites',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /optical-audit-sites\.spec\.ts/,
    },
    // Opt-in (pnpm --filter @livedoc/live test:e2e:drive): the Google Drive mirror against the fake
    // Google, signed in for real (docs/specs/022-drive-mirror/drive-mirror.md, "Testing"). Kept
    // out of CI's default run: it needs a build that carries the e2e Google client id.
    ...(drive
      ? [
          {
            name: 'drive',
            use: { ...devices['Desktop Chrome'], colorScheme: 'dark' as const },
            testMatch: /drive-mirror\.spec\.ts/,
          },
          // Every Drive state as a screenshot, light and dark (drive-shots.spec.ts sets each theme).
          {
            name: 'drive-shots',
            use: { ...devices['Desktop Chrome'], colorScheme: 'dark' as const },
            testMatch: /drive-shots\.spec\.ts/,
          },
        ]
      : []),
    ...(workbench
      ? [
          {
            name: 'workbench',
            use: { ...devices['Desktop Chrome'], colorScheme: 'dark' as const },
            testMatch: /workbench-(embed|workspace)\.spec\.ts/,
          },
        ]
      : []),
    ...(account
      ? [
          {
            name: 'account',
            use: { ...devices['Desktop Chrome'], colorScheme: 'dark' as const },
            testMatch: /account\/.*\.spec\.ts/,
            testIgnore: /account\/.*-budget\.spec\.ts/,
          },
          // A budget times the app, not the runner (docs/specs/003-system-architecture/e2e-smoke.md "Timing
          // budgets"): it runs once every other signed-in spec has finished, one test at a time, so no other browser
          // shares the CPU while it measures. The budget and its assertions are the spec's own.
          {
            name: 'account-budget',
            use: { ...devices['Desktop Chrome'], colorScheme: 'dark' as const },
            testMatch: /account\/.*-budget\.spec\.ts/,
            dependencies: ['account'],
            fullyParallel: false,
          },
        ]
      : []),
    ...(armed
      ? [
          {
            name: 'armed',
            use: { ...devices['Desktop Chrome'], colorScheme: 'dark' as const },
            testMatch: /armed\/.*\.spec\.ts/,
          },
        ]
      : []),
    // Opt-in (E2E_PERF=1, pnpm perf:canvas): the canvas performance probe
    // (docs/specs/008-canvas/canvas-performance.md "Measuring"). Reports against the budget and never
    // fails on a miss; it runs nightly (canvas-perf.yml), not on every push.
    ...(process.env.E2E_PERF === '1'
      ? [
          {
            name: 'perf',
            use: { ...devices['Desktop Chrome'], colorScheme: 'dark' as const },
            testMatch: /perf\/.*\.perf\.ts/,
            // One long measurement: a retry would only run it all again (and double the time).
            retries: 0,
          },
        ]
      : []),
    // Opt-in (E2E_WEBKIT=1, after `playwright install webkit`): the image import
    // pipeline's Safari path (docs/specs/020-import-export/import-image-pipeline.md) and the quick
    // style panel's swatch rows, which fit or wrap by the engine's layout
    // (docs/specs/008-canvas/quick-style-panel.md). Kept out of CI's default run to spare its
    // minutes; the same specs run in Chromium.
    ...(process.env.E2E_WEBKIT === '1'
      ? [
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            testMatch: /(import-images|quick-style-swatch-rows)\.spec\.ts/,
          },
        ]
      : []),
  ],
  webServer: {
    command: 'node ../../scripts/e2e-stack.mjs',
    url: BASE_URL,
    // Locally: reuse a running `pnpm dev`. In CI: always boot the stack
    // script fresh (there is no dev to reuse).
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: ownStack
      ? {
          E2E_LIVE_PORT: ownStack.ports.live,
          E2E_API_PORT: ownStack.ports.api,
          E2E_MARKETING_PORT: ownStack.ports.marketing,
          ...(ownStack.signIn ? { E2E_SIGN_IN: '1' } : {}),
          ...(ownStack.ports.google ? { E2E_GOOGLE_PORT: ownStack.ports.google } : {}),
        }
      : {},
  },
});
