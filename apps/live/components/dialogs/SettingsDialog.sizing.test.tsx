// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { SettingsDialog } from './SettingsDialog';

vi.mock('@/hooks/persistence/useAccountApiBootstrap', () => ({
  useAccountApiBootstrap: () => ({ accountId: null, isSignedIn: false }),
}));

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderDialog(initialCategoryId?: string) {
  render(
    <SettingsDialog
      settings={{}}
      onChange={vi.fn()}
      onClose={vi.fn()}
      aiCapable
      initialCategoryId={initialCategoryId}
    />,
  );
  return screen.getByRole('dialog');
}

const TRACKED_OR_HEAVY = /\buppercase\b|tracking-wider|font-semibold|font-bold/;

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

// docs/specs/004-interface-design/sizing.md: a dialog's title is 22 px regular, a section's 16 px, rows are 28 px at
// the reading size, supporting text is 12 px, and medium marks only the selected control.
describe('Settings on the sizing scale', () => {
  it('sets the dialog title at the dialog title step, regular', () => {
    setViewport(false);
    const dialog = renderDialog('appearance');

    const title = within(dialog).getByRole('heading', { level: 2 }).className;
    expect(title).toContain('text-dialog-title');
    expect(title).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('draws the rail on row steps, with medium only on the current category', () => {
    setViewport(false);
    const dialog = renderDialog('appearance');

    const current = within(dialog).getByRole('button', { current: 'page' });
    const other = within(dialog).getByRole('button', { name: 'Keyboard' });
    expect(current.className).toContain('min-h-row');
    expect(current.querySelector('.text-body')?.className).toContain('font-medium');
    expect(other.querySelector('.text-body')?.className).not.toContain('font-medium');
  });

  it('keeps a phone root list row at the 44 px tap height on a coarse pointer', () => {
    setViewport(true);
    const dialog = renderDialog();

    const row = within(dialog).getByRole('button', { name: 'Keyboard' });
    expect(row.className).toContain('min-h-row');
    expect(row.className).toContain('pointer-coarse:min-h-11');
  });

  it('titles a section at the panel title step, never in tracked capitals', () => {
    setViewport(false);
    const dialog = renderDialog('appearance');

    const section = within(dialog).getAllByRole('heading', { level: 3 })[0]!.className;
    expect(section).toContain('text-panel-title');
    expect(section).not.toMatch(TRACKED_OR_HEAVY);
  });

  it('sets a row label at the reading size, regular, over supporting text', () => {
    setViewport(false);
    const dialog = renderDialog('appearance');

    const label = dialog.querySelector('[data-settings-cell] [id$="-label"]')!.className;
    const description = dialog.querySelector(
      '[data-settings-cell] [id$="-description"]',
    )!.className;
    expect(label).toContain('text-body');
    expect(label).not.toMatch(/font-(medium|semibold)/);
    expect(description).toContain('text-supporting');
  });

  it('sets the footer note as supporting text', () => {
    setViewport(false);
    const dialog = renderDialog('appearance');

    expect(dialog.querySelector('footer p')!.className).toContain('text-supporting');
  });
});
