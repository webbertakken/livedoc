// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Keyboard and accessibility": each mark made here is a control over it in the
// page's tab sequence, named for its kind and author, pressed while selected; Tab to one selects it; arrow keys move
// the selection, ⇧ farther (PDF_MARK_NUDGE_PT, PDF_MARK_NUDGE_FAR_PT); Delete or Backspace deletes it; Escape lets it go.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Mark, PageName, PDF_MARK_NUDGE_FAR_PT, PDF_MARK_NUDGE_PT } from '@livedoc/pdf-documents';
import type { PdfPageChoosing } from '@/lib/pdf-document/usePdfMarkSelection';
import { PdfPageMarks } from './PdfPageMarks';

const BASE = { page: PageName.ofObject(1), colour: '#d93025', opacity: 1, createdAt: 0 };
const box = Mark.shape('rectangle', {
  ...BASE,
  id: 'r1',
  author: 'Ada Lovelace',
  rect: [20, 20, 60, 40],
  width: 2,
})!;
const arrow = Mark.line('arrow', {
  ...BASE,
  id: 'a1',
  author: 'Bob',
  line: [0, 0, 10, 10],
  width: 2,
})!;

function marks(chosen: readonly string[] = [], choose = true) {
  const choosing: PdfPageChoosing = {
    choose: vi.fn(),
    letGo: vi.fn(),
    leave: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
  };
  const onNudge = vi.fn();
  render(
    <PdfPageMarks
      index={3}
      matrix={[1, 0, 0, -1, 0, 100]}
      width={100}
      height={100}
      marks={[box, arrow]}
      chosen={chosen}
      choosing={choose ? choosing : null}
      onNudge={onNudge}
    />,
  );
  return { choosing, onNudge };
}

describe('the marks of a page as controls', () => {
  it('names each mark for its kind and author, over it, pressed while selected', () => {
    marks(['r1']);
    const control = screen.getByRole('button', { name: 'Rectangle by Ada Lovelace' });
    expect(control.getAttribute('aria-pressed')).toBe('true');
    expect(control.style.left).toBe('20%');
    expect(control.style.top).toBe('60%');
    expect(control.className).toContain('pointer-events-none');
    expect(screen.getByRole('button', { name: 'Arrow by Bob' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('selects a mark the keys reach, and leaves a selected one as it is', () => {
    const { choosing } = marks(['r1']);
    fireEvent.focus(screen.getByRole('button', { name: 'Arrow by Bob' }));
    expect(choosing.choose).toHaveBeenCalledWith(3, 'a1', false);
    fireEvent.focus(screen.getByRole('button', { name: 'Rectangle by Ada Lovelace' }));
    expect(choosing.choose).toHaveBeenCalledTimes(1);
  });

  it('moves the selection by the arrow keys, the way each points on screen, ⇧ farther', () => {
    const { onNudge } = marks(['r1']);
    const control = screen.getByRole('button', { name: 'Rectangle by Ada Lovelace' });
    fireEvent.keyDown(control, { key: 'ArrowRight' });
    fireEvent.keyDown(control, { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(control, { key: 'ArrowLeft' });
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    expect(onNudge.mock.calls).toEqual([
      [{ x: PDF_MARK_NUDGE_PT, y: 0 }],
      [{ x: 0, y: -PDF_MARK_NUDGE_FAR_PT }],
      [{ x: -PDF_MARK_NUDGE_PT, y: 0 }],
      [{ x: 0, y: PDF_MARK_NUDGE_PT }],
    ]);
  });

  it('deletes the selection with Delete or Backspace, and lets it go with Escape', () => {
    const { choosing } = marks(['r1']);
    const control = screen.getByRole('button', { name: 'Rectangle by Ada Lovelace' });
    fireEvent.keyDown(control, { key: 'Delete' });
    fireEvent.keyDown(control, { key: 'Backspace' });
    expect(choosing.remove).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(control, { key: 'Escape' });
    expect(choosing.leave).toHaveBeenCalled();
  });

  it('leaves other keys, and keys with ⌘, Ctrl or ⌥, to the pages', () => {
    const { choosing, onNudge } = marks(['r1']);
    const control = screen.getByRole('button', { name: 'Rectangle by Ada Lovelace' });
    const plain = fireEvent.keyDown(control, { key: 'v' });
    fireEvent.keyDown(control, { key: 'ArrowRight', altKey: true });
    fireEvent.keyDown(control, { key: 'Delete', metaKey: true });
    fireEvent.keyDown(control, { key: 'ArrowRight', ctrlKey: true });
    expect(plain).toBe(true);
    expect(onNudge).not.toHaveBeenCalled();
    expect(choosing.remove).not.toHaveBeenCalled();
  });

  it('reads the marks out, and changes nothing, while marks may not be changed', () => {
    const { onNudge } = marks([], false);
    const control = screen.getByRole('button', { name: 'Rectangle by Ada Lovelace' });
    fireEvent.focus(control);
    fireEvent.keyDown(control, { key: 'ArrowRight' });
    fireEvent.keyDown(control, { key: 'Delete' });
    expect(onNudge).not.toHaveBeenCalled();
    expect(control.getAttribute('aria-pressed')).toBeNull();
  });
});
