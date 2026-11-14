import { afterEach, describe, expect, it, vi } from 'vitest';

// docs/specs/008-canvas/canvas-performance.md "Measuring": nothing the probe does lands in a gesture's window.
// Playwright's own trace snapshots the page before and after every input action, a main-thread task of up to
// 60 ms on the reference board, so the probe's project runs without it, in CI as on a laptop.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function perfProject(ci: boolean) {
  vi.stubEnv('E2E_PERF', '1');
  vi.stubEnv('CI', ci ? '1' : '');
  const { default: config } = await import('../../playwright.config');
  const project = config.projects?.find((p) => p.name === 'perf');
  if (!project) throw new Error('NoPerfProject');
  return project;
}

describe('the perf project', () => {
  it('records no Playwright trace in CI', async () => {
    expect((await perfProject(true)).use?.trace).toBe('off');
  });

  it('records no Playwright trace locally', async () => {
    expect((await perfProject(false)).use?.trace).toBe('off');
  });
});
