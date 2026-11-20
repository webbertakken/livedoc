// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OfficeDialog } from './OfficeDialog';

function renderDialog(primary?: { label: string; onPress: () => void; disabled?: boolean }) {
  const onClose = vi.fn();
  render(
    <OfficeDialog open onClose={onClose} title="Word count" primary={primary}>
      <input aria-label="Name" />
    </OfficeDialog>,
  );
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Word count' }) };
}

// docs/specs/004-interface-design/office-shell.md "Dialogs".
describe('OfficeDialog', () => {
  it('is named by its title, drawn in the look tokens, and starts on its first field', () => {
    const { dialog } = renderDialog();
    expect(dialog.className).toContain('bg-(--office-dialog)');
    expect(dialog.className).toContain('w-[30rem]');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
  });

  it('is 720 px wide when wide', () => {
    render(
      <OfficeDialog open onClose={() => {}} title="Wide" wide>
        <p>Body</p>
      </OfficeDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Wide' }).className).toContain('w-[45rem]');
  });

  it('closes with no change from its ×', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no button row when there is nothing to confirm', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('runs the primary from its button and from Enter in a field, and Cancel closes', () => {
    const onPress = vi.fn();
    const { onClose } = renderDialog({ label: 'Apply', onPress });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.submit(screen.getByRole('textbox', { name: 'Name' }).closest('form')!);
    expect(onPress).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs a secondary button that changes only the dialog, closing nothing', () => {
    const onClose = vi.fn();
    const onReset = vi.fn();
    const onApply = vi.fn();
    render(
      <OfficeDialog
        open
        onClose={onClose}
        title="Borders"
        primary={{ label: 'Apply', onPress: onApply }}
        secondary={{ label: 'Reset', onPress: onReset }}
      >
        <p>Body</p>
      </OfficeDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('runs nothing while the primary is disabled', () => {
    const onPress = vi.fn();
    renderDialog({ label: 'Apply', onPress, disabled: true });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' }).disabled).toBe(true);
    fireEvent.submit(screen.getByRole('textbox', { name: 'Name' }).closest('form')!);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('moves the × to the front and the primary into the top bar on a phone', () => {
    renderDialog({ label: 'Apply', onPress: () => {} });
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('max-sm:order-first');
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('max-sm:hidden');
    expect(screen.getByRole('button', { name: 'Apply' }).parentElement!.className).toContain(
      'max-sm:absolute',
    );
  });
});
