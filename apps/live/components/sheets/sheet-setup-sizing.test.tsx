// @vitest-environment jsdom
// docs/specs/004-interface-design/sizing.md (D238): a Sheet's header and Setup Sheet are chrome on the sizing scale;
// its grid is content and keeps its own sizes.
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeSheet, renderSheet, stubResizeObserver } from './sheet-ui-test-utils';
import { SheetHeader } from './SheetHeader';
import { SheetSetup } from './SheetSetup';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

beforeAll(stubResizeObserver);
afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

describe('a Sheet’s header and setup on the sizing scale', () => {
  it('titles the Sheet at 16 px in regular weight', async () => {
    const h = await makeSheet({});
    const { container } = renderSheet(
      h,
      ({ actions }) => <SheetHeader elementId="el1" actions={actions} onImportCsv={() => {}} />,
      {},
    );

    expect(container.querySelector('[data-sheet-title]')!.className).toContain('text-panel-title');
    expect(container.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('heads Setup Sheet’s Start From step at 12 px as written, with no tracked capitals', async () => {
    const h = await makeSheet({});
    const { container } = renderSheet(h, () => <SheetSetup onImportCsv={() => {}} />, {});

    expect(container.querySelector('#setup-sheet-start')!.className).toContain('text-supporting');
    // The wizard around it (its title and step pills) is Plan's shared setup, which moves with Plan.
    expect(container.querySelector('[aria-labelledby="setup-sheet-start"]')!.innerHTML).not.toMatch(
      TRACKED_OR_HEAVY,
    );
  });
});
