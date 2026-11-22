// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SegmentedRadio } from './SegmentedRadio';

afterEach(cleanup);

// docs/specs/004-interface-design/sizing.md: a segment is a 28 px control at the reading size; medium marks the
// selected one alone.
describe('SegmentedRadio on the sizing scale', () => {
  it('sets only the selected segment in medium, every segment at the row step', () => {
    render(
      <SegmentedRadio
        label="Align"
        options={[
          { id: 'left', label: 'Left' },
          { id: 'right', label: 'Right' },
        ]}
        value="left"
        onChange={() => {}}
      />,
    );

    const left = screen.getByRole('radio', { name: 'Left' }).className;
    const right = screen.getByRole('radio', { name: 'Right' }).className;
    expect(left).toContain('font-medium');
    expect(right).not.toContain('font-medium');
    for (const segment of [left, right]) {
      expect(segment).toContain('min-h-row');
      expect(segment).toContain('text-body');
    }
  });
});
