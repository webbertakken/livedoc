// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Colour": the toolbar's Text colour and Highlight colour.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { OfficeToolbar } from './OfficeToolbar';
import { OfficeColourControl, type OfficeColour } from './OfficeColourControl';

const colour = (overrides: Partial<OfficeColour> = {}): OfficeColour => ({
  read: () => undefined,
  set: vi.fn(),
  leading: 'Reset',
  none: '#000000',
  ...overrides,
});

function setup(value: string | null | undefined, binding = colour()) {
  render(
    <OfficeColourControl
      id="text-colour"
      label="Text colour"
      icon={[]}
      colour={binding}
      value={value}
      tabIndex={0}
      className=""
    />,
  );
  return { binding, button: screen.getByRole('button', { name: 'Text colour' }) };
}

const bar = (button: HTMLElement) => button.querySelector<HTMLElement>('[data-colour-bar]')!;

describe('OfficeColourControl', () => {
  // formatting.md "Themes": a theme colour shows as the colour it is in the theme, its row first in the picker.
  it('shows a theme colour as its colour, and offers the theme row', () => {
    const theme = [{ id: 'theme:accent1', colour: '#4285f4', label: 'Accent 1' }];
    const { button, binding } = setup('theme:accent1', colour({ theme }));
    expect(bar(button).dataset.colourBar).toBe('#4285f4');
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Accent 1' }));
    expect(binding.set).toHaveBeenCalledWith('theme:accent1');
  });

  it('draws the bar in the colour at the caret, black for none, no colour over several', () => {
    const { button } = setup('#cc0000');
    expect(bar(button).dataset.colourBar).toBe('#cc0000');
    expect(bar(button).style.background).toBe('rgb(204, 0, 0)');
    expect(button.getAttribute('data-office-control')).toBe('text-colour');
  });

  it('draws text with no colour of its own in black ink', () => {
    const { button } = setup(undefined);
    expect(bar(button).dataset.colourBar).toBe('#000000');
  });

  it('draws no colour over a selection of several, and for no highlight', () => {
    const { button } = setup(null);
    expect(bar(button).dataset.colourBar).toBe('none');
    expect(bar(button).className).toContain('border');
  });

  it('opens the one picker: the leading option, Light and Dark rows, no Theme Palette', () => {
    const { button } = setup('#cc0000');
    fireEvent.click(button);
    const picker = screen.getByRole('group', { name: 'Text colour' });
    const headings = within(picker)
      .getAllByText(/^(Theme Palette|Light|Dark|Custom Colours|Colours)$/)
      .map((h) => h.textContent);
    expect(headings).toEqual(['Light', 'Dark', 'Custom Colours']);
    expect(within(picker).getByRole('button', { name: 'Reset' })).toBeTruthy();
  });

  it('sets a picked colour, and null for the leading option', () => {
    const { button, binding } = setup(undefined, colour({ leading: 'None', none: undefined }));
    fireEvent.click(button);
    const picker = screen.getByRole('group', { name: 'Text colour' });
    const none = within(picker).getByRole('button', { name: 'None' });
    expect(none.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(none);
    expect(binding.set).toHaveBeenLastCalledWith(null);
    fireEvent.click(button);
    const red = within(screen.getByRole('group', { name: 'Text colour' })).getAllByRole('button', {
      name: 'Red',
    })[1]!;
    fireEvent.click(red);
    expect(binding.set).toHaveBeenLastCalledWith(expect.stringMatching(/^#[0-9a-f]{6}$/));
    expect(screen.queryByRole('group', { name: 'Text colour' })).toBeNull();
  });
});

describe('OfficeToolbar colours', () => {
  it('draws a colour control where the kind binds it, and none where it does not', () => {
    const groups = [
      {
        id: 'text',
        label: 'Text',
        controls: [
          {
            id: 'text-colour',
            label: 'Text colour',
            level: 'edit' as const,
            status: 'built' as const,
            look: { kind: 'colour' as const, icon: [] },
          },
          {
            id: 'highlight-colour',
            label: 'Highlight colour',
            level: 'edit' as const,
            status: 'built' as const,
            look: { kind: 'colour' as const, icon: [] },
          },
        ],
      },
    ];
    render(
      <OfficeToolbar
        groups={groups}
        actions={{}}
        shortcutOf={() => null}
        zoom={null}
        colours={{ 'text-colour': colour({ read: () => '#00ff00' }) }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Text colour' });
    expect(bar(button).dataset.colourBar).toBe('#00ff00');
    expect(screen.queryByRole('button', { name: 'Highlight colour' })).toBeNull();
  });
});
