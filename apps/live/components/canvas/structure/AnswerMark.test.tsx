// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerMark } from './AnswerMark';

// The check an answered hotspot wears (docs/specs/021-event-storming/board-structure.md "Hotspot answers"): pointing
// at it or focusing it shows the answer; an Editor's press opens the answer for typing.
afterEach(cleanup);

const hooks = () => ({ onShow: vi.fn<() => void>(), onHide: vi.fn<() => void>() });

describe('AnswerMark', () => {
  it('is a button that says the answer and opens it, for whoever may answer', () => {
    const onOpen = vi.fn<() => void>();
    render(<AnswerMark noteId="who" answer="The host." onOpen={onOpen} {...hooks()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Answered: The host.' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is an image that says the answer, with nothing to press, for everyone else', () => {
    render(<AnswerMark noteId="who" answer="The host." {...hooks()} />);
    expect(screen.queryByRole('button')).toBeNull();
    const mark = screen.getByRole('img', { name: 'Answered: The host.' });
    expect(mark.tabIndex).toBe(0);
  });

  it('shows the answer while pointed at or focused, and lets go after', () => {
    const h = hooks();
    render(<AnswerMark noteId="who" answer="The host." {...h} />);
    const mark = screen.getByRole('img', { name: 'Answered: The host.' });
    fireEvent.pointerEnter(mark);
    fireEvent.pointerLeave(mark);
    fireEvent.focus(mark);
    fireEvent.blur(mark);
    expect(h.onShow).toHaveBeenCalledTimes(2);
    expect(h.onHide).toHaveBeenCalledTimes(2);
  });

  it('keeps a press from the canvas beneath it', () => {
    const onPointerDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <AnswerMark noteId="who" answer="The host." onOpen={vi.fn()} {...hooks()} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Answered: The host.' }));
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});
