// @vitest-environment jsdom
// docs/specs/035-pdf-documents/opening.md "Passwords": a file that asks something says so in the notice bar, with
// Enter permissions password; the dialog lifts the limits for this person, or says the password didn't.
// reading-surface.md "Notices": one bar, its action, Dismiss for this open.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdfPermissions } from '@livedoc/pdf-documents';
import { PdfLimits } from './PdfLimits';

const NO_COPY = { ...PdfPermissions.all(), copy: false };

function limits(liftLimits = vi.fn(async (_password: string) => false), permissions = NO_COPY) {
  const view = render(<PdfLimits permissions={permissions} liftLimits={liftLimits} />);
  return { liftLimits, view };
}

const enter = (password: string) => {
  fireEvent.change(screen.getByLabelText('Permissions password', { selector: 'input' }), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
};

describe('the limits notice', () => {
  it('says what the file asks, with Enter permissions password and Dismiss', () => {
    limits();
    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain('This PDF limits what can be done with it.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says nothing for a file that asks nothing', () => {
    const { view } = limits(undefined, PdfPermissions.all());
    expect(view.container.innerHTML).toBe('');
  });
});

describe('the permissions password dialog', () => {
  it('lifts the limits with the right password, closing the dialog', async () => {
    const liftLimits = vi.fn(async () => true);
    limits(liftLimits);
    fireEvent.click(screen.getByRole('button', { name: 'Enter permissions password' }));
    expect(screen.getByRole('dialog', { name: 'Permissions password' }).textContent).toContain(
      "Its permissions password lifts this PDF's limits for you.",
    );
    const field = screen.getByLabelText('Permissions password', { selector: 'input' });
    expect(field.getAttribute('type')).toBe('password');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Enter' }).disabled).toBe(true);
    await act(async () => enter('owner'));
    expect(liftLimits).toHaveBeenCalledWith('owner');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says a password that lifts nothing, tied to the field, which keeps focus', async () => {
    limits();
    fireEvent.click(screen.getByRole('button', { name: 'Enter permissions password' }));
    await act(async () => enter('swordfish'));
    const said = screen.getByRole('alert');
    expect(said.textContent).toBe("That password didn't lift this PDF's limits.");
    const field = screen.getByLabelText<HTMLInputElement>('Permissions password', {
      selector: 'input',
    });
    expect(field.getAttribute('aria-describedby')).toBe(said.id);
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'swordfish'.length]);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('gives one password at a time, and closes on Cancel', async () => {
    let settle: (lifted: boolean) => void = () => {};
    const liftLimits = vi.fn(() => new Promise<boolean>((resolve) => (settle = resolve)));
    limits(liftLimits);
    fireEvent.click(screen.getByRole('button', { name: 'Enter permissions password' }));
    enter('owner');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Enter' }).disabled).toBe(true);
    fireEvent.submit(
      screen.getByLabelText('Permissions password', { selector: 'input' }).closest('form')!,
    );
    expect(liftLimits).toHaveBeenCalledTimes(1);
    await act(async () => settle(false));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
