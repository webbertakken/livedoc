// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CountBadge } from './CountBadge';

afterEach(cleanup);

// docs/specs/004-interface-design/sizing.md "Shapes": a count badge sits where an icon would, 16 or 18 px, its
// figure a glyph in regular weight.
describe('CountBadge on the sizing scale', () => {
  it('takes the icon row step small and the icon toolbar step at md', () => {
    render(
      <>
        <CountBadge count={3} label="three" />
        <CountBadge count={12} size="md" label="twelve" />
      </>,
    );

    expect(screen.getByLabelText('three').className).toContain('h-icon-row');
    expect(screen.getByLabelText('twelve').className).toContain('h-icon-toolbar');
  });

  it('sets its figure as a glyph in regular weight in every tone', () => {
    render(
      <>
        <CountBadge count={1} label="neutral" />
        <CountBadge count={2} tone="brand" label="brand" />
        <CountBadge count={3} background="#000" color="#fff" label="painted" />
      </>,
    );

    for (const name of ['neutral', 'brand', 'painted']) {
      const badge = screen.getByLabelText(name).className;
      expect(badge, name).toContain('text-glyph');
      expect(badge, name).not.toMatch(/font-(semibold|medium)/);
    }
  });
});
