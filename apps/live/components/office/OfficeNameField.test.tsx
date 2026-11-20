// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { OFFICE_NAME_EMPTY, OfficeNameField } from './OfficeNameField';

// docs/specs/034-text-documents/editing-surface.md "The title row": the name.
describe('OfficeNameField', () => {
  const field = () => screen.getByRole('textbox', { name: 'Rename' });

  it('renames on Enter, once, with the name trimmed', () => {
    const onRename = vi.fn();
    render(<OfficeNameField name="Minutes" onRename={onRename} focusNonce={0} />);
    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: '  Minutes, May  ' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    fireEvent.blur(field());
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('Minutes, May');
  });

  it('renames on blur', () => {
    const onRename = vi.fn();
    render(<OfficeNameField name="Minutes" onRename={onRename} focusNonce={0} />);
    fireEvent.change(field(), { target: { value: 'Notes' } });
    fireEvent.blur(field());
    expect(onRename).toHaveBeenCalledWith('Notes');
  });

  it('puts the name back on Escape, renaming nothing', () => {
    const onRename = vi.fn();
    render(<OfficeNameField name="Minutes" onRename={onRename} focusNonce={0} />);
    fireEvent.change(field(), { target: { value: 'Notes' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    fireEvent.blur(field());
    expect(onRename).not.toHaveBeenCalled();
    expect((field() as HTMLInputElement).value).toBe('Minutes');
  });

  it('refuses an empty name, saying so, and puts the name back', () => {
    const onRename = vi.fn();
    render(<OfficeNameField name="Minutes" onRename={onRename} focusNonce={0} />);
    fireEvent.change(field(), { target: { value: '   ' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(OFFICE_NAME_EMPTY);
    expect((field() as HTMLInputElement).value).toBe('Minutes');
  });

  it('writes nothing for the same name', () => {
    const onRename = vi.fn();
    render(<OfficeNameField name="Minutes" onRename={onRename} focusNonce={0} />);
    fireEvent.change(field(), { target: { value: 'Minutes ' } });
    fireEvent.blur(field());
    expect(onRename).not.toHaveBeenCalled();
  });

  it('follows a rename from elsewhere while not being edited', () => {
    const { rerender } = render(
      <OfficeNameField name="Minutes" onRename={vi.fn()} focusNonce={0} />,
    );
    rerender(<OfficeNameField name="Agenda" onRename={vi.fn()} focusNonce={0} />);
    expect((field() as HTMLInputElement).value).toBe('Agenda');
  });

  it('is text, with no field, for a session that may not rename', () => {
    render(<OfficeNameField name="Minutes" onRename={null} focusNonce={0} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Minutes');
  });

  it('keeps the name as the page heading while it is a field', () => {
    render(<OfficeNameField name="Minutes" onRename={vi.fn()} focusNonce={0} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Minutes');
  });

  it('takes the focus with the name selected when File > Rename asks', () => {
    const { rerender } = render(
      <OfficeNameField name="Minutes" onRename={vi.fn()} focusNonce={0} />,
    );
    expect(document.activeElement).not.toBe(field());
    act(() => {
      rerender(<OfficeNameField name="Minutes" onRename={vi.fn()} focusNonce={1} />);
    });
    expect(document.activeElement).toBe(field());
    const input = field() as HTMLInputElement;
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Minutes'.length]);
  });
});
