import { afterEach, describe, expect, it, vi } from 'vitest';
import { CI_CPU_HEADROOM, cpuBudgetMs, cpuMsOf, cpuNowMs } from './cpu-time.js';

// docs/specs/003-system-architecture/testing.md "A tight budget is written for a developer's machine and widened
// on CI and under coverage".
afterEach(() => vi.unstubAllEnvs());

describe('cpuBudgetMs', () => {
  it('is the written budget in a plain run', () => {
    vi.stubEnv('CI', '');
    vi.stubEnv('LIVEDOC_COVERAGE', '');
    expect(cpuBudgetMs(16)).toBe(16);
  });

  it('widens on CI', () => {
    vi.stubEnv('LIVEDOC_COVERAGE', '');
    vi.stubEnv('CI', 'true');
    expect(cpuBudgetMs(16)).toBe(16 * CI_CPU_HEADROOM);
    vi.stubEnv('CI', '1');
    expect(cpuBudgetMs(16)).toBe(16 * CI_CPU_HEADROOM);
  });

  // CI=false is how some shells and images turn CI behaviour off: it is a developer's machine, held to the budget.
  it('holds the budget where CI is set to say no', () => {
    vi.stubEnv('LIVEDOC_COVERAGE', '');
    vi.stubEnv('CI', 'false');
    expect(cpuBudgetMs(16)).toBe(16);
    vi.stubEnv('CI', '0');
    expect(cpuBudgetMs(16)).toBe(16);
  });

  it('widens under coverage, where instrumentation slows the same work', () => {
    vi.stubEnv('CI', '');
    vi.stubEnv('LIVEDOC_COVERAGE', '1');
    expect(cpuBudgetMs(16)).toBe(16 * CI_CPU_HEADROOM);
  });
});

describe('cpuNowMs', () => {
  const spin = () => {
    let sum = 0;
    for (let i = 0; i < 3_000_000; i += 1) sum += Math.sqrt(i);
    return sum;
  };

  it('counts the work between two reads, as cpuMsOf counts a call', () => {
    const before = cpuNowMs();
    spin();
    const read = cpuNowMs() - before;

    expect(read).toBeGreaterThan(0);
    // The same work, measured the other way: the two agree to within what one run varies from the next.
    expect(read).toBeLessThan(cpuMsOf(spin) * 10 + 50);
  });

  it('does not count a wait', async () => {
    const before = cpuNowMs();
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(cpuNowMs() - before).toBeLessThan(100);
  });
});
