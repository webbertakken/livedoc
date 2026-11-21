import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RETRY_WAITS_MS,
  cloudflareServerError,
  runWithRetry,
} from '../../../scripts/wrangler-retry.mjs';

// docs/specs/016-platform/deployment.md "Cloudflare's own errors are retried".
describe('cloudflareServerError', () => {
  it('names an API error code of 10500 or above', () => {
    expect(
      cloudflareServerError('Internal authentication error: internal server error [code: 10500]'),
    ).toBe('code 10500');
  });

  it('names an HTTP 5xx', () => {
    expect(cloudflareServerError('failed with status 503 Service Unavailable')).toBe('HTTP 503');
  });

  it('passes over what a retry cannot mend', () => {
    expect(cloudflareServerError('Authentication error [code: 10000]')).toBeNull();
    expect(
      cloudflareServerError('This Worker does not exist on your account. [code: 10007]'),
    ).toBeNull();
    expect(cloudflareServerError('Script startup exceeded CPU time limit')).toBeNull();
    expect(cloudflareServerError('')).toBeNull();
  });
});

describe('runWithRetry', () => {
  const ok = { status: 0, output: '' };
  const serverError = { status: 1, output: '✘ [ERROR] internal server error [code: 10500]' };
  const refused = { status: 1, output: '✘ [ERROR] Authentication error [code: 10000]' };

  async function harness(results: { status: number; output: string }[]) {
    const slept: number[] = [];
    const logged: string[] = [];
    let calls = 0;
    const status = await runWithRetry({
      run: async () => results[Math.min(calls++, results.length - 1)],
      waitsMs: [1, 2, 3],
      sleep: async (ms: number) => {
        slept.push(ms);
      },
      log: (line: string) => logged.push(line),
    });
    return { status, slept, logged, calls: () => calls };
  }

  it('runs again after a server error, then succeeds', async () => {
    const h = await harness([serverError, ok]);
    expect(h.status).toBe(0);
    expect(h.slept).toEqual([1]);
    expect(h.logged[0]).toContain('code 10500');
  });

  it('fails at once on an error a retry cannot mend', async () => {
    const h = await harness([refused, ok]);
    expect(h.status).toBe(1);
    expect(h.slept).toEqual([]);
    expect(h.calls()).toBe(1);
  });

  it('fails after the last wait when the server keeps failing', async () => {
    const h = await harness([serverError]);
    expect(h.status).toBe(1);
    expect(h.slept).toEqual([1, 2, 3]);
    expect(h.calls()).toBe(4);
  });

  it('waits 5, 15 and 45 seconds', () => {
    expect(RETRY_WAITS_MS).toEqual([5000, 15000, 45000]);
  });
});

// docs/specs/016-platform/deployment.md "The tools a deploy step runs".
describe('the deploy workflow', () => {
  const workflow = readFileSync(
    fileURLToPath(new URL('../../../.github/workflows/deploy-reusable.yml', import.meta.url)),
    'utf8',
  );

  it('runs every deploy through the retry, from the workflow’s own commit', () => {
    const deploys = workflow
      .split('\n')
      .filter((line) => line.includes('pnpm exec wrangler deploy'));
    expect(deploys).toHaveLength(7);
    for (const line of deploys) {
      expect(line).toContain(
        'node "$GITHUB_WORKSPACE/.workflow-tools/scripts/wrangler-retry.mjs" pnpm exec',
      );
    }
  });

  it('never runs scripts/ from the deployed checkout', () => {
    expect(workflow).not.toMatch(/node \.\.\/\.\.\/scripts\//);
    expect(workflow).toMatch(/ref: \$\{\{ github\.workflow_sha \}\}/);
  });
});
