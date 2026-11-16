// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAST_TAB_CONFIRM } from '@/lib/tab-deletion';
import { ConfirmPopover } from './ConfirmPopover';

// The last tab's confirmation is a warning, never a danger (docs/specs/006-document/document-structure.md "The last
// tab", docs/specs/004-interface-design/destructive-actions.md): an amber warning line, a primary confirm, no red.

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const RED = /\b(?:bg|text|ring|border)-(?:red|rose)-/;

function openLastTabConfirm() {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  render(
    <ConfirmPopover
      anchor={anchor}
      message={LAST_TAB_CONFIRM.message}
      warning={LAST_TAB_CONFIRM.warning}
      confirmLabel={LAST_TAB_CONFIRM.confirmLabel}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  return screen.getByRole('dialog', { name: LAST_TAB_CONFIRM.message });
}

describe('the last tab confirmation', () => {
  it('warns that the document goes too, on an amber warning line with its mark', () => {
    const dialog = openLastTabConfirm();
    const warning = screen.getByText(LAST_TAB_CONFIRM.warning!);
    expect(warning.textContent).toMatch(/whole document/);
    expect(warning.className).toMatch(/\bbg-amber-50\b/);
    expect(warning.className).toMatch(/\bdark:bg-amber-500\/10\b/);
    expect(warning.className).toMatch(/\btext-amber-900\b/);
    expect(warning.className).toMatch(/\bdark:text-amber-100\b/);
    expect(warning.querySelector('svg')).not.toBeNull();
    expect(dialog.innerHTML).not.toMatch(RED);
  });

  it('confirms with the primary Delete Document button, never a red one', () => {
    openLastTabConfirm();
    const confirm = screen.getByRole('button', { name: 'Delete Document' });
    expect(confirm.className).toMatch(/\bbg-brand-700\b/);
    expect(confirm.className).not.toMatch(RED);
  });
});
