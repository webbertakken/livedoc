// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOTSPOT_ANSWER_MAX } from '@livedoc/document';
import { AnswerField } from './AnswerField';

// The field a hotspot is answered in (docs/specs/021-event-storming/board-structure.md "Hotspot answers"): Enter or
// leaving it keeps the answer, Escape leaves it as it was.
afterEach(cleanup);

function open(answer = '') {
  const onKeep = vi.fn<(text: string) => void>();
  const onLeave = vi.fn<() => void>();
  render(
    <AnswerField
      question="Who seats walk-ins?"
      answer={answer}
      onKeep={onKeep}
      onLeave={onLeave}
    />,
  );
  const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Answer' });
  return { field, onKeep, onLeave };
}

describe('AnswerField', () => {
  it('opens focused, holding the answer, and names the question it answers', () => {
    const { field } = open('The host.');
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('The host.');
    expect(field.maxLength).toBe(HOTSPOT_ANSWER_MAX);
    expect(screen.getByRole('group', { name: 'Answer to: Who seats walk-ins?' })).toBeTruthy();
  });

  it('keeps what was typed on Enter', () => {
    const { field, onKeep, onLeave } = open();
    fireEvent.change(field, { target: { value: 'The host.' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onKeep).toHaveBeenCalledWith('The host.');
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('keeps what was typed when the field is left', () => {
    const { field, onKeep } = open();
    fireEvent.change(field, { target: { value: 'The host.' } });
    fireEvent.blur(field);
    expect(onKeep).toHaveBeenCalledWith('The host.');
  });

  it('leaves the answer as it was on Escape, and says so once', () => {
    const { field, onKeep, onLeave } = open('The host.');
    fireEvent.change(field, { target: { value: 'Nobody.' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.blur(field);
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it('does not keep while a word is still being composed', () => {
    const { field, onKeep } = open();
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    expect(onKeep).not.toHaveBeenCalled();
  });

  it('keeps its keys from the canvas', () => {
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <AnswerField question="Why?" answer="" onKeep={vi.fn()} onLeave={vi.fn()} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Answer' }), { key: 'Delete' });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('counts the characters near the limit only', () => {
    const { field } = open('The host.');
    expect(screen.queryByText(/\/ 300/)).toBeNull();
    fireEvent.change(field, { target: { value: 'a'.repeat(240) } });
    expect(screen.getByText('240 / 300')).toBeTruthy();
  });
});
