// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Editing headers and footers": Headers and footers options.
import { describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  HeaderOptions,
  HeaderOptionsScope,
} from '@/lib/text-document/text-document-header-options';
import { TextDocumentHeaderOptionsDialog } from './TextDocumentHeaderOptionsDialog';

const OPTIONS: HeaderOptions = {
  header: 36,
  footer: 36,
  differentFirst: false,
  differentOddEven: false,
};

const open = ({
  options = OPTIONS,
  scopes = ['section'] as const,
  onApply = vi.fn<(options: HeaderOptions, scope: HeaderOptionsScope) => void>(),
}: {
  options?: HeaderOptions;
  scopes?: readonly HeaderOptionsScope[];
  onApply?: Mock<(options: HeaderOptions, scope: HeaderOptionsScope) => void>;
} = {}) => {
  render(
    <TextDocumentHeaderOptionsDialog
      open
      options={options}
      unit="in"
      scopes={scopes}
      // Letter less 1 in for the section, a shorter page in the document.
      mostOf={(scope) => (scope === 'section' ? 720 : 360)}
      onApply={onApply}
      onClose={vi.fn()}
    />,
  );
  return onApply;
};

const header = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Header (in)' });
const footer = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Footer (in)' });
const apply = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' });

describe('TextDocumentHeaderOptionsDialog', () => {
  it("opens at the section's margins and switches, named as Google's", () => {
    open({ options: { ...OPTIONS, footer: 18, differentOddEven: true } });
    expect(screen.getByRole('dialog', { name: 'Headers & footers' })).toBeTruthy();
    expect(header().value).toBe('0.5');
    expect(footer().value).toBe('0.25');
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Different first page' }).checked,
    ).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Different odd and even' }).checked,
    ).toBe(true);
  });

  it('offers no Apply to with one section', () => {
    open();
    expect(screen.queryByRole('combobox', { name: 'Apply to' })).toBeNull();
  });

  it('applies the margins in the unit, the switches and the scope', () => {
    const onApply = open({ scopes: ['section', 'document'] });
    const scope = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Apply to' });
    expect(scope.value).toBe('section');
    fireEvent.change(header(), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Different first page' }));
    fireEvent.change(scope, { target: { value: 'document' } });
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith(
      { header: 72, footer: 36, differentFirst: true, differentOddEven: false },
      'document',
    );
  });

  it("keeps a section's exact margin left as shown", () => {
    const onApply = open({ options: { ...OPTIONS, header: 35.4 } });
    expect(header().value).toBe('0.49');
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ ...OPTIONS, header: 35.4 }, 'section');
  });

  it('refuses a margin past the page height less 1 in, the whole document its shortest page', () => {
    open({ scopes: ['section', 'document'] });
    fireEvent.change(footer(), { target: { value: '6' } });
    expect(apply().disabled).toBe(false);
    fireEvent.change(screen.getByRole('combobox', { name: 'Apply to' }), {
      target: { value: 'document' },
    });
    expect(screen.getByText('Enter a number from 0 to 5.')).toBeTruthy();
    expect(apply().disabled).toBe(true);
    fireEvent.change(footer(), { target: { value: '' } });
    expect(apply().disabled).toBe(true);
  });
});
