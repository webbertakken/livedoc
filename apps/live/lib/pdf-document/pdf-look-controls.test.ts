// docs/specs/035-pdf-documents/marks.md "Changing a mark": Format > Colour and Fill colour open the toolbar's Colour and
// Fill, dimmed while it offers none; reading-surface.md "The toolbar": Line width offers Format > Line width's steps
// while one may run, and is dimmed while none may.
import { describe, expect, it, vi } from 'vitest';
import type { OfficeColour } from '@/components/office/OfficeColourControl';
import { lookControls } from './pdf-look-controls';
import { FILL_COLOUR, LINE_WIDTH, TOOL_COLOUR } from './pdf-toolbar';

const colour: OfficeColour = { read: () => null, set: () => {}, leading: 'Reset' };

describe('the look controls', () => {
  it('open the toolbar’s Colour and Fill from Format, dimmed while it offers none', () => {
    const open = vi.fn(() => true);
    const offered = lookControls({}, { [TOOL_COLOUR]: colour, [FILL_COLOUR]: colour }, open);
    offered.actions['format-colour']!.run();
    offered.actions['format-fill-colour']!.run();
    expect(open.mock.calls).toEqual([[TOOL_COLOUR], [FILL_COLOUR]]);
    expect(offered.actions['format-colour']!.disabled).toBe(false);
    const none = lookControls({}, {}, open);
    expect(none.actions['format-colour']!.disabled).toBe(true);
    expect(none.actions['format-fill-colour']!.disabled).toBe(true);
  });

  it('offer Line width’s steps while one may run, showing the one checked', () => {
    const run = () => {};
    const actions = {
      'line-width-1-pt': { run, checked: false },
      'line-width-4-pt': { run, checked: true },
    };
    const { choices, actions: own } = lookControls(actions, {});
    expect(own[LINE_WIDTH]).toBeUndefined();
    const widths = choices[LINE_WIDTH]!;
    expect(widths.read()).toBe('4 pt');
    expect(widths.actions).toBe(actions);
    expect(widths.entries.map((entry) => ('label' in entry ? entry.label : ''))).toEqual([
      '0.5 pt',
      '1 pt',
      '2 pt',
      '4 pt',
      '8 pt',
      '12 pt',
    ]);
    expect(lookControls({ 'line-width-1-pt': { run } }, {}).choices[LINE_WIDTH]!.read()).toBeNull();
  });

  it('dim Line width while no step may run', () => {
    const dimmed = lookControls({ 'line-width-1-pt': { run: () => {}, disabled: true } }, {});
    expect(dimmed.choices).toEqual({});
    expect(dimmed.actions[LINE_WIDTH]!.disabled).toBe(true);
  });
});
