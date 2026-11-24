// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Tag } from '@livedoc/api-schema';
import { TagChip } from '@/components/tags/TagChip';
import { ToastCard } from './ToastCard';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;
const tag: Tag = { id: 'a', name: 'Alpha', colour: 'blue', createdAt: 1 };

// docs/specs/004-interface-design/sizing.md with toasts.md "Look": a toast reads at 14 px, its actions are 32 px with
// medium on the primary only, its close is a 28 px icon button, and a tag chip names its tag at 12 or 14 px.
describe('toasts and tags on the sizing scale', () => {
  it('draws a toast at the reading size with a 32 px primary action and a 28 px close', () => {
    render(
      <ToastCard
        tone="info"
        message="Document deleted"
        actions={[
          { label: 'Undo', onSelect: () => {}, primary: true },
          { label: 'View', onSelect: () => {} },
        ]}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Document deleted').className).toContain('text-body');
    const undo = screen.getByRole('button', { name: 'Undo' }).className;
    expect(undo).toContain('h-field');
    expect(undo).toContain('font-medium');
    expect(screen.getByRole('button', { name: 'View' }).className).not.toContain('font-medium');
    expect(screen.getByRole('button', { name: 'Dismiss' }).className).toContain('size-row');
    expect(document.body.innerHTML).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('names a small tag chip at 12 px and a large one at 14 px', () => {
    render(
      <>
        <TagChip tag={tag} size="sm" />
        <TagChip tag={{ ...tag, id: 'b', name: 'Beta' }} size="md" />
      </>,
    );

    expect(screen.getByText('Alpha').closest('[class*="text-"]')!.className).toContain(
      'text-supporting',
    );
    expect(screen.getByText('Beta').closest('[class*="text-"]')!.className).toContain('text-body');
  });
});
