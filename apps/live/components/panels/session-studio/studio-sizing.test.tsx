// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PollStyleTiles } from './PollStyleTiles';
import { StudioButton, StudioLabel, StudioSegmented } from './studio-ui';
import { TimerPresetChips } from './TimerPresetChips';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: a button is the 32 px field step at 14 px, a row-sized choice is 28 px,
// labels are 12 px supporting text in their own case, and medium marks only the chosen or primary control.
describe('Session Studio on the sizing scale', () => {
  it('draws a studio button at the field step, medium only when primary', () => {
    render(
      <>
        <StudioButton variant="primary" onClick={() => {}}>
          Start vote
        </StudioButton>
        <StudioButton onClick={() => {}}>Cancel</StudioButton>
      </>,
    );

    const primary = screen.getByRole('button', { name: 'Start vote' }).className;
    expect(primary).toContain('min-h-field');
    expect(primary).toContain('text-body');
    expect(primary).toContain('font-medium');
    expect(screen.getByRole('button', { name: 'Cancel' }).className).not.toContain('font-medium');
  });

  it('labels a studio section as supporting text in its own case', () => {
    render(<StudioLabel aside="3 each">Dots per person</StudioLabel>);

    expect(screen.getByText('Dots per person').className).toContain('text-supporting');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws the segmented pills and the preset chips on row steps at the reading size', () => {
    render(
      <>
        <StudioSegmented
          label="Mode"
          value="countdown"
          onChange={() => {}}
          options={[
            { value: 'countdown', label: 'Countdown' },
            { value: 'stopwatch', label: 'Stopwatch' },
          ]}
        />
        <TimerPresetChips minutes={5} onPick={() => {}} />
      </>,
    );

    const chosen = screen.getByRole('radio', { name: 'Countdown' }).className;
    expect(chosen).toContain('min-h-row');
    expect(chosen).toContain('text-body');
    expect(chosen).toContain('font-medium');
    expect(screen.getByRole('radio', { name: 'Stopwatch' }).className).not.toContain('font-medium');
    const preset = screen.getByRole('button', { name: '5m' }).className;
    expect(preset).toContain('min-h-row');
    expect(preset).toContain('text-body');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('names each poll style as supporting text', () => {
    render(<PollStyleTiles style="choice" onChange={() => {}} />);

    for (const tile of screen.getAllByRole('radio'))
      expect(tile.querySelector('.text-supporting')).not.toBeNull();
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });
});
