// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Reactions": chips that add or take back one's own, text for a reader; Add
// emoji reaction offering the quick six and More emoji (the Insert emoji dialog, closed on a pick).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommentReactions } from './CommentReactions';

afterEach(cleanup);

const CHIPS = [
  { emoji: '👍', count: 2, mine: true, label: 'You and Ada reacted with 👍' },
  { emoji: '🎉', count: 1, mine: false, label: 'Ada reacted with 🎉' },
];

const emojiDialog = vi.hoisted(() => ({ pick: '' }));
vi.mock('@/components/office/OfficeEmojiDialog', () => ({
  OfficeEmojiDialog: ({
    onPick,
    onClose,
  }: {
    onPick: (t: string) => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="Insert emoji">
      <button type="button" onClick={() => onPick(emojiDialog.pick)}>
        pick
      </button>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

describe('CommentReactions', () => {
  it('draws each chip with its count, one’s own pressed, and toggles one’s own', () => {
    const onReact = vi.fn();
    render(<CommentReactions chips={CHIPS} onReact={onReact} />);
    const mine = screen.getByRole('button', { name: 'You and Ada reacted with 👍' });
    expect(mine.getAttribute('aria-pressed')).toBe('true');
    expect(mine.textContent).toBe('👍2');
    fireEvent.click(mine);
    fireEvent.click(screen.getByRole('button', { name: 'Ada reacted with 🎉' }));
    expect(onReact.mock.calls).toEqual([
      ['👍', false],
      ['🎉', true],
    ]);
  });

  it('draws chips as text for a reader, with no Add emoji reaction', () => {
    render(<CommentReactions chips={CHIPS} />);
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.getByLabelText('You and Ada reacted with 👍')).toBeTruthy();
  });

  it('offers the quick six, and takes one', () => {
    const onReact = vi.fn();
    render(<CommentReactions chips={CHIPS} onReact={onReact} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add emoji reaction' }));
    const quick = screen.getByRole('group', { name: 'Reactions' });
    fireEvent.click(quick.querySelector('[aria-label="React with ❤️"]')!);
    expect(onReact).toHaveBeenCalledWith('❤️', true);
    expect(screen.queryByRole('group', { name: 'Reactions' })).toBeNull();
  });

  it('takes back one’s own when picked again, and closes on Escape', () => {
    const onReact = vi.fn();
    render(<CommentReactions chips={CHIPS} onReact={onReact} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add emoji reaction' }));
    fireEvent.click(screen.getByRole('button', { name: 'React with 👍' }));
    expect(onReact).toHaveBeenCalledWith('👍', false);
    fireEvent.click(screen.getByRole('button', { name: 'Add emoji reaction' }));
    fireEvent.keyDown(screen.getByRole('group', { name: 'Reactions' }), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Reactions' })).toBeNull();
  });

  it('opens More emoji, reacts with the pick and closes it', () => {
    const onReact = vi.fn();
    emojiDialog.pick = '🍕';
    render(<CommentReactions chips={[]} onReact={onReact} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add emoji reaction' }));
    fireEvent.click(screen.getByRole('button', { name: 'More emoji' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick' }));
    expect(onReact).toHaveBeenCalledWith('🍕', true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
