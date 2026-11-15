import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { laneNameElement } from './event-storming-structure';
import { GRAPH_MUTED } from './graph-muted';

const importsOf = (file: string) =>
  [...readFileSync(join(__dirname, file), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]);

// docs/specs/016-platform/web-performance.md "Nothing heavy in what every route ships": element validation reaches
// a lane's name, and the editor's api client reaches validation, so what the lane name imports ships with the
// Explorer. Importing the grey from the graph header once brought the graph look's routing and layout along: about
// 47 KiB on every Explorer page.
describe('the muted grey', () => {
  it('is a module with no imports of its own', () => {
    expect(importsOf('graph-muted.ts')).toEqual([]);
  });

  it('reaches a lane name without the graph header', () => {
    expect(importsOf('event-storming-structure.ts')).not.toContain('./graph-header');
    expect(laneNameElement({ id: 'n', name: 'Billing', lane: 0, wallLeft: 0 }).textColor).toBe(
      GRAPH_MUTED,
    );
  });
});
