// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SplitSeamControls } from '@/components/split/SplitSeamControls';
import { ColourField } from './ColourField';
import { SwatchChip } from './ColourSwatch';
import { noColour, standardGroup } from './colour-options';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;
const picker = {
  label: 'Colour',
  standard: [standardGroup('strong', 'light', 'hex')],
  leading: [noColour('none', 'None')],
};

// docs/specs/004-interface-design/sizing.md "Shapes" (D236) and colour-picker.md "One swatch": a colour field is a
// 32 px field at 14 px, a swatch button is the 24 px chip step holding a 16 or 20 px chip, a seam control is 28 px.
describe('colour, split and drive on the sizing scale', () => {
  it('draws a colour field as a 32 px field at the reading size, its chip at the row icon step', () => {
    render(
      <ColourField
        {...picker}
        value="none"
        none
        swatch="transparent"
        name="None"
        onPick={() => {}}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Colour: None' });
    expect(trigger.className).toContain('h-field');
    expect(trigger.className).toContain('text-body');
    expect(trigger.querySelector('[data-swatch-chip]')!.getAttribute('class')).toContain(
      'size-icon-row',
    );
  });

  it('opens the picker with headings in their own case and swatches on the chip step', () => {
    render(
      <ColourField
        {...picker}
        value="none"
        none
        swatch="transparent"
        name="None"
        onPick={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Colour: None' }));

    expect(screen.getByRole('button', { name: 'None' }).className).toContain('size-chip');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws a swatch chip at 20 px with the control radius', () => {
    const { container } = render(<SwatchChip colour="#ff0000" />);

    const chip = container.querySelector('[data-swatch-chip]')!.getAttribute('class')!;
    expect(chip).toContain('size-icon-title');
    expect(chip).toContain('rounded-control');
  });

  it('draws the split seam controls as 28 px round buttons', () => {
    render(<SplitSeamControls canFit onFit={() => {}} onClose={() => {}} />);

    for (const button of screen.getAllByRole('button'))
      expect(button.className).toContain('size-row');
  });
});
