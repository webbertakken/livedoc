// @vitest-environment jsdom

// docs/specs/034-text-documents/files-and-print.md "Make a copy": the Copy document dialog's name, folder and review
// choices, its primary while the copy is made, and a refusal said in the dialog.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfficeCopyDialog, type OfficeCopyChoice } from './OfficeCopyDialog';

afterEach(cleanup);

function draw(props: Partial<Parameters<typeof OfficeCopyDialog>[0]> = {}) {
  const onCopy = vi.fn<(choice: OfficeCopyChoice) => void>();
  const onChange = vi.fn<() => void>();
  render(
    <OfficeCopyDialog
      open
      documentName="Plan"
      folder={{ name: 'Reports', onChange }}
      offerReview
      copying={false}
      failure={null}
      onCopy={onCopy}
      onClose={vi.fn()}
      {...props}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Copy document' });
  const name = dialog.querySelector<HTMLInputElement>('[data-office-copy-name]')!;
  const copy = () => fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
  return { dialog, name, copy, onCopy, onChange };
}

describe('OfficeCopyDialog', () => {
  it('opens on "Copy of" the name, focused and selected', () => {
    const { name } = draw();
    expect(name.value).toBe('Copy of Plan');
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 'Copy of Plan'.length]);
  });

  it('copies with no comment or suggestion by default (Google’s)', () => {
    const { copy, onCopy } = draw();
    copy();
    expect(onCopy).toHaveBeenCalledExactlyOnceWith({
      name: 'Copy of Plan',
      review: { comments: false, resolved: false },
    });
  });

  it('offers resolved ones only while comments and suggestions are copied', () => {
    const { dialog, name, copy, onCopy } = draw();
    expect(dialog.querySelector('[data-office-copy-resolved]')).toBeNull();
    fireEvent.click(dialog.querySelector('[data-office-copy-comments]')!);
    fireEvent.click(dialog.querySelector('[data-office-copy-resolved]')!);
    fireEvent.change(name, { target: { value: 'Mine' } });
    copy();
    expect(onCopy).toHaveBeenLastCalledWith({
      name: 'Mine',
      review: { comments: true, resolved: true },
    });
    // Unticking the first leaves the second out, whatever it held.
    fireEvent.click(dialog.querySelector('[data-office-copy-comments]')!);
    expect(dialog.querySelector('[data-office-copy-resolved]')).toBeNull();
    copy();
    expect(onCopy).toHaveBeenLastCalledWith({
      name: 'Mine',
      review: { comments: false, resolved: false },
    });
  });

  it('offers a Viewer no review choice', () => {
    const { dialog, copy, onCopy } = draw({ offerReview: false });
    expect(dialog.querySelector('[data-office-copy-comments]')).toBeNull();
    copy();
    expect(onCopy).toHaveBeenCalledExactlyOnceWith({ name: 'Copy of Plan', review: null });
  });

  it('names the folder and changes it with Change', () => {
    const { dialog, onChange } = draw();
    expect(dialog.querySelector('[data-office-copy-folder]')!.textContent).toContain('Reports');
    fireEvent.click(screen.getByRole('button', { name: 'Change folder, now Reports' }));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('has no folder row for a copy made in This Browser', () => {
    const { dialog } = draw({ folder: null });
    expect(dialog.querySelector('[data-office-copy-folder]')).toBeNull();
  });

  it('says it is making the copy, and cannot be pressed twice', () => {
    draw({ copying: true });
    const primary = screen.getByRole<HTMLButtonElement>('button', { name: 'Making a copy…' });
    expect(primary.disabled).toBe(true);
  });

  it('says a refusal in the dialog', () => {
    draw({ failure: 'The copy couldn’t be made. Try again.' });
    expect(screen.getByRole('alert').textContent).toBe('The copy couldn’t be made. Try again.');
  });
});
