// The account and connect pages' card (docs/specs/004-interface-design/sizing.md): chrome on the scale, though the
// stage around it is display type.

import { describe, expect, it } from 'vitest';
import { AUTH_STAGE_CARD, AUTH_TITLE } from './auth-card';

describe('the auth card', () => {
  it('titles the page at the page title step, regular', () => {
    const classes = AUTH_TITLE.split(' ');
    expect(classes).toContain('text-page-title');
    expect(classes.some((c) => c.startsWith('font-'))).toBe(false);
  });

  it('is a surface with the scale’s side padding', () => {
    const classes = AUTH_STAGE_CARD.split(' ');
    expect(classes).toContain('rounded-surface');
    expect(classes).toContain('p-6');
  });
});
