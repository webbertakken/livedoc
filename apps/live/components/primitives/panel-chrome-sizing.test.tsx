// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EllipsisTriggerButton } from './EllipsisTriggerButton';
import { PanelTitle } from './MovablePanelHeader';
import { SearchInput } from './SearchInput';

afterEach(cleanup);

// docs/specs/004-interface-design/sizing.md: a panel's title is 16 px regular in its own case, a field is 32 px at
// the reading size, and no icon button is drawn under 24 px.
describe('panel chrome on the sizing scale', () => {
  it('sets a panel title at the panel title step, never in tracked capitals', () => {
    render(<PanelTitle title="Layers" />);

    const title = screen.getByText('Layers').className;
    expect(title).toContain('text-panel-title');
    expect(title).not.toMatch(/\buppercase\b|tracking-wider|font-semibold/);
  });

  it('draws the row menu trigger at the chip step in a dense row and the row step otherwise', () => {
    render(
      <>
        <EllipsisTriggerButton label="Dense" size="md" onClick={() => {}} />
        <EllipsisTriggerButton label="Roomy" onClick={() => {}} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Dense' }).className).toContain('size-chip');
    expect(screen.getByRole('button', { name: 'Roomy' }).className).toContain('size-row');
  });

  it('draws a search box as a field at the reading size', () => {
    render(
      <SearchInput
        value="arrow"
        onChange={() => {}}
        placeholder="Search"
        ariaLabel="Search icons"
        clearAriaLabel="Clear search"
        clearDescription="Clear the icon search query."
      />,
    );

    const field = screen.getByRole('textbox', { name: 'Search icons' }).className;
    expect(field).toContain('h-field');
    expect(field).toContain('text-body');
  });
});
