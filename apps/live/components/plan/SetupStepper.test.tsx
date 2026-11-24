// @vitest-environment jsdom
// docs/specs/004-interface-design/sizing.md "Type": medium marks the chosen step of Setup Board's stepper, and only it.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planPalette } from './plan-palette';
import { SetupStepper } from './SetupStepper';

afterEach(cleanup);

const STEPS = [
  { id: 'columns', label: 'Columns' },
  { id: 'cards', label: 'Cards' },
  { id: 'layout', label: 'Layout' },
] as const;

describe('Setup Board’s stepper on the sizing scale', () => {
  it('sets the current step’s name in medium and the others regular', () => {
    render(
      <SetupStepper steps={STEPS} at={1} palette={planPalette('dark', {})} onStep={vi.fn()} />,
    );
    const medium = (label: string) =>
      screen.getByText(label).className.split(/\s+/).includes('font-medium');
    expect(STEPS.map((s) => medium(s.label))).toEqual([false, true, false]);
  });
});
