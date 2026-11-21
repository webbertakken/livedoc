// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "The bar": a named toolbar; Link to previous only after the first
// section; Options holds Header format and Page numbers (coming), and Remove, dimmed while linked.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { headerOptionsEntries, TextDocumentHeaderBar } from './TextDocumentHeaderBar';

const bar = (props: Partial<Parameters<typeof TextDocumentHeaderBar>[0]> = {}) => {
  const handlers = { onFirst: vi.fn(), onLink: vi.fn(), onRemove: vi.fn(), onBack: vi.fn() };
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

  it('names the menu’s entries for the kind, the format and page numbers to come', () => {
    expect(headerOptionsEntries('header')).toMatchObject([
      { id: 'header-format', label: 'Header format', status: 'comingSoon' },
      { id: 'header-page-numbers', label: 'Page numbers', status: 'comingSoon' },
      { kind: 'separator' },
      { id: 'remove-header', label: 'Remove header', status: 'built' },
    ]);
  });

  it('dims Remove while linked', () => {
    const { onRemove } = bar({ later: true, linked: true });
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    const remove = screen.getByRole('menuitem', { name: /Remove footer/ });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(remove);
    expect(onRemove).not.toHaveBeenCalled();
  });
});
