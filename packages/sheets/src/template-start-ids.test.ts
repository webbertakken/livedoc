import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_START_SHEETS } from './template-start-ids';

// docs/specs/016-platform/web-performance.md: the Explorer's search finds a Plan template by its sheet's words, so the
// starts' names never bring the sheet engine into the search's code.
describe('template-start-ids', () => {
  it('imports no sheet code', () => {
    const src = readFileSync(join(__dirname, 'template-start-ids.ts'), 'utf8');

    expect(src).not.toMatch(/^import\s+(?!type\b)/m);
  });

  it('names the sheet template of every designed start', () => {
    expect(TEMPLATE_START_SHEETS['budget-planner']).toBe('budget');
  });
});
