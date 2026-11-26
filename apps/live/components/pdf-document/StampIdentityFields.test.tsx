// @vitest-environment jsdom
// docs/specs/035-pdf-documents/custom-stamps.md "Managing them" and marks.md "Stamps": Manage stamps' Identity, four
// fields kept once left, Escape putting back what each held, a field that could not be kept said.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PDF_STAMP_IDENTITY_FIELD_MAX_CHARS } from '@livedoc/pdf-documents';
import { StampIdentityFields } from './StampIdentityFields';

const drawn = (keep = vi.fn((): string | null => null)) => {
  const onProblem = vi.fn();
  render(
    <StampIdentityFields
      identity={{ title: 'Chief Engineer', email: 'ada@example.org' }}
      keep={keep}
      onProblem={onProblem}
    />,
  );
  return { keep, onProblem };
};

describe('Manage stamps’ Identity', () => {
  it('says what it is for, and asks for each field, labelled, filled with what is kept', () => {
    drawn();
    expect(
      screen.getByText('Dynamic stamps you place show your title and organisation.'),
    ).toBeTruthy();
    const title = screen.getByLabelText<HTMLInputElement>('Title');
    expect(title.value).toBe('Chief Engineer');
    expect(title.maxLength).toBe(PDF_STAMP_IDENTITY_FIELD_MAX_CHARS);
    expect(title.autocomplete).toBe('organization-title');
    expect(screen.getByLabelText<HTMLInputElement>('Organisation').autocomplete).toBe(
      'organization',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Unit').value).toBe('');
    const email = screen.getByLabelText<HTMLInputElement>('Email');
    expect(email.type).toBe('email');
    expect(email.value).toBe('ada@example.org');
  });

  it('keeps a field once left, Enter leaving it, and keeps nothing unchanged', () => {
    const { keep } = drawn();
    const organisation = screen.getByLabelText<HTMLInputElement>('Organisation');
    fireEvent.change(organisation, { target: { value: 'Analytical Ltd' } });
    fireEvent.keyDown(organisation, { key: 'Enter' });
    fireEvent.blur(organisation);
    expect(keep).toHaveBeenCalledWith('organisation', 'Analytical Ltd');
    keep.mockClear();
    fireEvent.blur(screen.getByLabelText('Title'));
    expect(keep).not.toHaveBeenCalled();
  });

  it('keeps an emptied field, which clears it', () => {
    const { keep } = drawn();
    const title = screen.getByLabelText<HTMLInputElement>('Title');
    fireEvent.change(title, { target: { value: '' } });
    fireEvent.blur(title);
    expect(keep).toHaveBeenCalledWith('title', '');
  });

  it('puts back what a field held on Escape, and leaves the dialog open', () => {
    const { keep } = drawn();
    const title = screen.getByLabelText<HTMLInputElement>('Title');
    fireEvent.change(title, { target: { value: 'Boss' } });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const stopped = vi.spyOn(escape, 'stopPropagation');
    title.dispatchEvent(escape);
    expect(stopped).toHaveBeenCalled();
    expect(title.value).toBe('Chief Engineer');
    fireEvent.blur(title);
    expect(keep).not.toHaveBeenCalled();
  });

  it('says a field that could not be kept', () => {
    const { onProblem } = drawn(vi.fn(() => 'Your identity couldn’t be saved.'));
    const unit = screen.getByLabelText<HTMLInputElement>('Unit');
    fireEvent.change(unit, { target: { value: 'Engines' } });
    fireEvent.blur(unit);
    expect(onProblem).toHaveBeenCalledWith('Your identity couldn’t be saved.');
  });
});
