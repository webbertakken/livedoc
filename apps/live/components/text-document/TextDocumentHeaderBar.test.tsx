// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "The bar": a named toolbar; Link to previous only after the first
// section; Options holds Header format, Page numbers, and Remove, dimmed while linked.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { headerOptionsEntries, TextDocumentHeaderBar } from './TextDocumentHeaderBar';

const bar = (props: Partial<Parameters<typeof TextDocumentHeaderBar>[0]> = {}) => {
  const handlers = {
    onFirst: vi.fn(),
    onLink: vi.fn(),
    onRemove: vi.fn(),
    onFormat: vi.fn(),
    onPageNumbers: vi.fn(),
    onBack: vi.fn(),
  };
  render(
    <TextDocumentHeaderBar
      kind="footer"
      differentFirst={false}
      later={false}
      linked={false}
      toolbar={createRef()}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

describe('TextDocumentHeaderBar', () => {
  it('is a toolbar named for its kind, Link to previous only after the first section', () => {
    bar();
    expect(screen.getByRole('toolbar', { name: 'Footer options' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Different first page' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Link to previous' })).toBeNull();
  });

  it('removes from its Options menu, dimmed while linked', () => {
    const { onRemove } = bar({ later: true });
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove footer/ }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('names the menu’s entries for the kind', () => {
    expect(headerOptionsEntries('header')).toMatchObject([
      { id: 'header-format', label: 'Header format', status: 'built' },
      { id: 'header-page-numbers', label: 'Page numbers', status: 'built' },
      { kind: 'separator' },
      { id: 'remove-header', label: 'Remove header', status: 'built' },
    ]);
  });

  it('opens Headers and footers options from Footer format', () => {
    const { onFormat } = bar();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Footer format/ }));
    expect(onFormat).toHaveBeenCalledTimes(1);
  });

  it('opens the Page numbers dialog from Page numbers', () => {
    const { onPageNumbers } = bar();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Page numbers/ }));
    expect(onPageNumbers).toHaveBeenCalledTimes(1);
  });

  it('dims Remove while linked', () => {
    const { onRemove } = bar({ later: true, linked: true });
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    const remove = screen.getByRole('menuitem', { name: /Remove footer/ });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(remove);
    expect(onRemove).not.toHaveBeenCalled();
  });

  // review.md "Headers, footers and notes": while suggesting, the bar's settings are dimmed, saying why.
  it('dims its settings while suggesting, running none', () => {
    const handlers = bar({ later: true, settingsOff: true });
    const first = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Different first page' });
    const link = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Link to previous' });
    expect(first.disabled && link.disabled).toBe(true);
    fireEvent.click(first);
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    const remove = screen.getByRole('menuitem', { name: /Remove footer/ });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(remove.textContent).toContain('Editing only');
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole('menuitem', { name: /Footer format/ }));
    expect(handlers.onFirst).not.toHaveBeenCalled();
    expect(handlers.onRemove).not.toHaveBeenCalled();
    expect(handlers.onFormat).not.toHaveBeenCalled();
  });
});
