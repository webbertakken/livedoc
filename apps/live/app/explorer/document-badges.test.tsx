// @vitest-environment jsdom

// A document's visibility badge: the word beside its icon, or only the icon
// in minimal chrome (power user mode), its name kept for assistive technology.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FolderChip, VisibilityBadge } from './document-badges';
import type { PaneDocument } from './views';

afterEach(cleanup);

const PRIVATE = { id: 'd', name: 'Plan', ownerId: 'me', savedAt: 1 } as unknown as PaneDocument;

describe('VisibilityBadge', () => {
  it('shows the word by default', () => {
    render(<VisibilityBadge document={PRIVATE} />);
    const word = screen.getByText('Private');
    expect(word.className).not.toContain('sr-only');
  });

  it('shows only the lock when icon-only, still named and reachable by keyboard', () => {
    render(<VisibilityBadge document={PRIVATE} iconOnly />);
    const word = screen.getByText('Private');
    expect(word.className).toContain('sr-only');
    expect(word.parentElement!.getAttribute('tabindex')).toBe('0');
  });
});

describe('VisibilityBadge on a document in this browser', () => {
  it('leaves the state to the This Browser pill (docs/specs/006-document/offline-mode.md#this-browser-pill)', () => {
    const local = { ...PRIVATE, ownerId: 'offline' } as PaneDocument;
    const { container } = render(<VisibilityBadge document={local} />);
    expect(container.textContent).toBe('');
  });
});

// The badges on the sizing scale (docs/specs/004-interface-design/sizing.md "Type"): the supporting step, regular.
describe('document badges on the sizing scale', () => {
  it('sets the visibility badge at the supporting step, regular', () => {
    render(<VisibilityBadge document={PRIVATE} />);
    const badge = screen.getByText('Private').parentElement!;
    expect(badge.className).toMatch(/(^|\s)text-supporting(\s|$)/);
    expect(badge.className).not.toMatch(/font-semibold|text-\[/);
  });

  it('sets the folder chip at the supporting step, its icon at the row step', () => {
    render(<FolderChip label="Design" onOpen={() => {}} />);
    const chip = screen.getByRole('button', { name: /Design/ });
    expect(chip.className).toMatch(/(^|\s)text-supporting(\s|$)/);
    expect(chip.className).toMatch(/(^|\s)rounded-control(\s|$)/);
    expect(chip.querySelector('[class*="size-icon-row"]')).not.toBeNull();
  });
});
