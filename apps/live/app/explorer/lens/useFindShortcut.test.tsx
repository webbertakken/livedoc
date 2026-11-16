// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));
import { useFindShortcut } from './useFindShortcut';

function Page({ dialog = false }: { dialog?: boolean }) {
  const field = useRef<HTMLInputElement>(null);
  useFindShortcut(field);
  return (
    <>
      <input ref={field} aria-label="Filter documents" defaultValue="roadmap" />
      <button type="button">Row</button>
      {dialog ? <div role="dialog" aria-modal="true" /> : null}
    </>
  );
}

const press = (target: Element, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', {
    key: 'f',
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe('useFindShortcut', () => {
  it('puts the caret in the search with its words selected on Ctrl F and Cmd F', () => {
    render(<Page />);
    const row = screen.getByRole('button');
    row.focus();
    expect(press(row, { ctrlKey: true }).defaultPrevented).toBe(true);
    const field = screen.getByRole<HTMLInputElement>('textbox');
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 7]);
    expect(track).toHaveBeenCalledWith('Explorer', 'Opened', 'FindShortcut');
    row.focus();
    expect(press(row, { metaKey: true }).defaultPrevented).toBe(true);
  });

  it('leaves a second press, and any press with a dialog open, to the browser', () => {
    const { unmount } = render(<Page />);
    const field = screen.getByRole('textbox');
    field.focus();
    expect(press(field, { ctrlKey: true }).defaultPrevented).toBe(false);
    unmount();
    render(<Page dialog />);
    expect(press(screen.getByRole('button'), { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('leaves F alone', () => {
    render(<Page />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'f' });
    expect(document.activeElement).not.toBe(screen.getByRole('textbox'));
  });
});
