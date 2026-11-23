// @vitest-environment jsdom
// Pick-one settings draw one picture per option (docs/specs/007-editor/user-preferences.md): the
// Theme row. A drawing missing an option would leave that option with nothing to
// ring, and one drawn for an option that no longer exists would show a choice
// you can't make.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SETTINGS_CATEGORIES } from './settings-catalogue';
import { CHOICE_ILLUSTRATIONS } from './settings-choice-illustrations';
import { SettingsIllustration } from './settings-illustrations';
import { REM_PER_UNIT } from './settings-illustration-kit';

afterEach(cleanup);

const ROWS = SETTINGS_CATEGORIES.flatMap((c) => c.rows);

describe('choice illustrations', () => {
  it('draws exactly the options of every illustrated choice row', () => {
    const illustrated = ROWS.filter(
      (r) => r.kind === 'choice' && r.illustration && r.illustration in CHOICE_ILLUSTRATIONS,
    );
    for (const row of illustrated) {
      if (row.kind !== 'choice' || !row.illustration) continue;
      const drawn = CHOICE_ILLUSTRATIONS[row.illustration as keyof typeof CHOICE_ILLUSTRATIONS];
      expect(
        drawn.states.map((s) => s.id),
        row.key,
      ).toEqual(row.options.map((o) => o.id));
      expect(
        drawn.states.map((s) => s.caption),
        row.key,
      ).toEqual(row.options.map((o) => o.label));
    }
  });

  it('draws the Theme row as light, dark and system', () => {
    const theme = ROWS.find((r) => r.key === 'appearance');
    expect(theme?.illustration).toBe('appearance');
    expect(CHOICE_ILLUSTRATIONS.appearance.states.map((s) => s.id).sort()).toEqual([
      'dark',
      'light',
      'system',
    ]);
  });

  it('rings the option in force, and only that one', () => {
    const { container } = render(<SettingsIllustration id="appearance" value="dark" />);
    const captions = [...container.querySelectorAll('text')];
    expect(captions.map((t) => t.textContent)).toEqual(['Light', 'Dark', 'System']);
    const current = captions.filter((t) => t.getAttribute('class')?.includes('font-medium'));
    expect(current.map((t) => t.textContent)).toEqual(['Dark']);
  });

  // docs/specs/004-interface-design/sizing.md: supporting text is 12 px, a caption under a drawing too.
  it('draws each caption at the supporting step at the widest the drawing renders', () => {
    const { container } = render(<SettingsIllustration id="appearance" value="dark" />);
    const sizes = [...container.querySelectorAll('text')].map((t) =>
      Number(t.getAttribute('font-size')),
    );
    expect(sizes.map((units) => Math.round(units * REM_PER_UNIT * 16 * 100) / 100)).toEqual([
      12, 12, 12,
    ]);
  });

  it('describes the drawing for assistive tech', () => {
    const { container } = render(<SettingsIllustration id="appearance" value="dark" />);
    expect(container.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toMatch(
      /light mode.*dark mode/,
    );
  });
});
