// @vitest-environment jsdom
// docs/specs/035-pdf-documents/opening.md "Passwords": the open password asked on the pages' place, a wrong one said
// and focus kept in the field; "Refusals": a glyph, one sentence as the region's heading, the second line, Download
// wherever the bytes are held, Try again after a stop; "Keyboard and accessibility".
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import type { PdfDocumentOpen } from '@/lib/pdf-document/usePdfDocument';
import { PdfOpenNotices } from './PdfOpenNotices';

const KEY = 'ab'.repeat(32) as BlobKey;

function notices(open: PdfDocumentOpen) {
  const onTryAgain = vi.fn();
  const onDownload = vi.fn();
  const view = render(
    <PdfOpenNotices open={open} onTryAgain={onTryAgain} onDownload={onDownload} />,
  );
  return { onTryAgain, onDownload, view };
}

const locked = (tries: number, unlock = vi.fn(async (_password: string) => {})) =>
  ({ phase: 'locked', storedFile: KEY, tries, unlock }) as const;

describe('the password screen', () => {
  it('asks for the password with the field in focus, Open dimmed while it is empty', () => {
    notices(locked(0));
    const region = screen.getByRole('region', { name: 'This PDF is protected.' });
    expect(region.textContent).toContain('Enter its password to open it.');
    const field = screen.getByLabelText('Password');
    expect(region.contains(field)).toBe(true);
    expect(field.getAttribute('type')).toBe('password');
    expect(document.activeElement).toBe(field);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Open' }).disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('gives the engine the password on Enter, Open dimmed while it checks', async () => {
    let settle = () => {};
    const unlock = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
    notices(locked(0, unlock));
    const field = screen.getByLabelText('Password');
    fireEvent.change(field, { target: { value: 'open sesame' } });
    fireEvent.submit(field.closest('form')!);
    expect(unlock).toHaveBeenCalledWith('open sesame');
    const open = screen.getByRole<HTMLButtonElement>('button', { name: 'Open' });
    expect(open.disabled).toBe(true);
    // A second Enter while the engine checks gives nothing more.
    fireEvent.submit(field.closest('form')!);
    expect(unlock).toHaveBeenCalledTimes(1);
    await act(async () => settle());
    expect(open.disabled).toBe(false);
  });

  it('gives nothing while the field is empty', () => {
    const unlock = vi.fn(async () => {});
    notices(locked(0, unlock));
    fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
    expect(unlock).not.toHaveBeenCalled();
  });

  it('says a wrong password, tied to the field, which keeps focus with what was typed selected', () => {
    const { onTryAgain, onDownload, view } = notices(locked(0));
    const field = screen.getByLabelText<HTMLInputElement>('Password');
    fireEvent.change(field, { target: { value: 'swordfish' } });
    field.blur();
    view.rerender(
      <PdfOpenNotices open={locked(1)} onTryAgain={onTryAgain} onDownload={onDownload} />,
    );
    const said = screen.getByRole('alert');
    expect(said.textContent).toBe("That password didn't open this PDF.");
    expect(field.getAttribute('aria-describedby')).toBe(said.id);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'swordfish'.length]);
  });

  it('offers the stored file to download', () => {
    const { onDownload } = notices(locked(0));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalled();
  });
});

describe('a refusal', () => {
  it('heads with its sentence, says what can still be done, and offers Download', () => {
    const { onDownload } = notices({ phase: 'refused', refusal: 'pdf_damaged', storedFile: KEY });
    const region = screen.getByRole('region', { name: "This PDF is damaged and can't be opened." });
    expect(region.textContent).toContain('You can still download the file.');
    expect(region.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalled();
  });

  it('offers Try again after a stop', () => {
    const { onTryAgain } = notices({ phase: 'refused', refusal: 'pdf_stopped', storedFile: KEY });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onTryAgain).toHaveBeenCalled();
  });

  it('offers no Download where the bytes are not held', () => {
    notices({ phase: 'refused', refusal: 'blob_missing', storedFile: null });
    expect(
      screen.getByRole('region', { name: "This PDF's file is missing from storage." }),
    ).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('the other notices', () => {
  it('says a PDF gone from the document, and a tab that could not load, to be tried again', () => {
    notices({ phase: 'gone' }).view.unmount();
    expect(screen.queryByRole('region')).toBeNull();
    const { onTryAgain, view } = notices({ phase: 'failed' });
    expect(screen.getByRole('alert', { name: 'This tab couldn’t load.' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onTryAgain).toHaveBeenCalled();
    view.unmount();
    notices({ phase: 'gone' });
    expect(
      screen.getByRole('region', { name: 'This PDF is no longer in this document.' }),
    ).toBeTruthy();
  });

  it('shows nothing while the PDF opens', () => {
    const { view } = notices({ phase: 'opening' });
    expect(view.container.innerHTML).toBe('');
  });
});
