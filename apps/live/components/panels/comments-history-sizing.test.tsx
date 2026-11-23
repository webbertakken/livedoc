// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommentResolveToggle, CommentThreadList } from './comment-thread-parts';
import { HISTORY_BUTTON, HISTORY_LINK, INSET } from './document-history/history-styles';

afterEach(cleanup);

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-|font-semibold|font-bold/;

// docs/specs/004-interface-design/sizing.md: everything read or pressed is 14 px, a row-sized control is 28 px,
// supporting text is 12 px, side padding steps 16 or 24 px, and nothing is set semibold or in tracked capitals.
describe('comments and history on the sizing scale', () => {
  it('draws Resolve as a 28 px control at the reading size', () => {
    render(<CommentResolveToggle resolved={false} onResolve={() => {}} onUnresolve={() => {}} />);

    const resolve = screen.getByRole('button', { name: 'Resolve' }).className;
    expect(resolve).toContain('min-h-row');
    expect(resolve).toContain('text-body');
    expect(resolve).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('reads an empty thread at the reading size in both densities', () => {
    for (const density of ['compact', 'comfortable'] as const) {
      render(
        <CommentThreadList
          thread={undefined}
          readOnly={false}
          selfId="me"
          onDeleteComment={() => {}}
          density={density}
        />,
      );
      expect(screen.getByText(/No comments yet/).className).toContain('text-body');
      cleanup();
    }
  });

  it('sizes history buttons as fields, links as supporting text, and insets on the side padding steps', () => {
    expect(HISTORY_BUTTON).toContain('min-h-field');
    expect(HISTORY_BUTTON).toContain('text-body');
    expect(HISTORY_BUTTON).not.toMatch(TRACKED_OR_HEAVY);
    expect(HISTORY_LINK).toContain('text-supporting');
    expect(INSET).toBe('px-4 sm:px-6');
  });
});
