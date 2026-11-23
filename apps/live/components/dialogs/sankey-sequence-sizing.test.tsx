// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { rowsFromFlows, withTrailingBlank } from '@/lib/sankey-flow-rows';
import { SankeyFlowsTable } from './SankeyFlowsTable';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: a field is the 32 px step at 14 px, headings are regular, supporting
// text is 12 px, and nothing is set semibold or in tracked capitals.
describe('the Sankey flows table on the sizing scale', () => {
  it('draws its fields at the field step and its headings regular', () => {
    render(
      <SankeyFlowsTable
        rows={withTrailingBlank(
          rowsFromFlows([
            { from: 'Salary', to: 'Budget', value: 3200 },
            { from: 'Budget', to: 'Needs', value: 2000 },
          ]),
        )}
        nodes={undefined}
        onSetLeftover={() => {}}
        onRows={() => {}}
        onCommit={() => {}}
      />,
    );

    for (const field of screen.getAllByRole('textbox')) {
      expect(field.className).toContain('h-field');
      expect(field.className).toContain('text-body');
    }
    expect(screen.getByRole('heading', { name: 'Add a Flow' }).className).toContain('text-body');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
