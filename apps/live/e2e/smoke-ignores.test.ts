import { describe, expect, it } from 'vitest';
import config from '../playwright.config';

// The smoke project leaves the suites with their own stacks to their own projects, by folder. Playwright tests those
// patterns against a spec's absolute path, so a pattern that only names a folder ("perf/") also matches a checkout
// whose own name ends that way (a worktree at ../livedoc-perf), and the whole suite then lists no tests.
describe('the smoke project’s ignored folders', () => {
  const smoke = config.projects?.find((project) => project.name === 'chromium');
  const ignores = [smoke?.testIgnore ?? []].flat();
  const ignored = (path: string) =>
    ignores.some((pattern) => (pattern instanceof RegExp ? pattern.test(path) : false));

  it('leave out the suites that need a stack or a build of their own', () => {
    for (const spec of [
      '/repo/apps/live/e2e/account/sign-in.spec.ts',
      '/repo/apps/live/e2e/armed/first-visit.spec.ts',
      '/repo/apps/live/e2e/perf/canvas.perf.ts',
    ]) {
      expect(ignored(spec), spec).toBe(true);
    }
  });

  it('keep every other spec, whatever the checkout is called', () => {
    for (const spec of [
      '/home/someone/livedoc-perf/apps/live/e2e/explorer-home.spec.ts',
      '/home/someone/account/apps/live/e2e/hints.spec.ts',
      '/home/someone/armed/apps/live/e2e/hints.spec.ts',
    ]) {
      expect(ignored(spec), spec).toBe(false);
    }
  });
});
