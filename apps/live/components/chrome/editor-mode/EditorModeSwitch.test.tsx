// @vitest-environment jsdom

// The mode switch beside the menu button (docs/specs/007-editor/editor-modes.md "The mode switch"): a compact chip,
// named for the editor, on every tab an Editor may switch, empty or not; its menu floats in a portal; it and the
// start's switch read and write the one mode, so they always agree.

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorMode } from '@livedoc/document';
import type { EditorModeState } from '@/hooks/editor/useEditorMode';
import { StartModeSwitch } from '@/components/start/StartModeSwitch';
import { EditorModeProvider } from './editor-mode-context';
import { EditorModeSwitch } from './EditorModeSwitch';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/view-transition', () => ({
  startTypedTransition: (_type: string, change: () => void) => change(),
}));

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSwitch(
  mode: EditorMode,
  over: Partial<EditorModeState> = {},
  props: { iconOnly?: boolean } = {},
) {
  const setMode = vi.fn<(mode: EditorMode) => void>();
  const view = render(
    <EditorModeProvider
      value={{
        mode,
        setMode,
        canSwitch: true,
        canEdit: true,
        workshop: false,
        setWorkshop: vi.fn(),
        ...over,
      }}
    >
      <EditorModeSwitch {...props} />
    </EditorModeProvider>,
  );
  return { setMode, ...view };
}

const chip = () => screen.getByRole('button', { name: /^Editor mode:/ });

describe('EditorModeSwitch', () => {
  it('is a compact menu button named for the editor, showing the mode by icon and name', () => {
    renderSwitch('draw');
    expect(chip().getAttribute('aria-label')).toBe('Editor mode: Sketch');
    expect(chip().getAttribute('aria-haspopup')).toBe('menu');
    expect(chip().getAttribute('aria-keyshortcuts')).toBe('Shift+D');
    expect(chip().textContent).toBe('Sketch');
    expect(chip().className).toContain('tool-line:h-field');
  });

  it('shows its icon alone on a phone, keeping its accessible name', () => {
    renderSwitch('pages', {}, { iconOnly: true });
    expect(chip().getAttribute('aria-label')).toBe('Editor mode: Pages');
    expect(chip().textContent).toBe('');
    expect(chip().querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it.each([
    ['a Participant or a Viewer', { canEdit: false, canSwitch: false }],
    ['a locked tab, an event-storming board or a Plan tab', { canEdit: true, canSwitch: false }],
  ])('renders nothing for %s', (_, gate) => {
    const { container } = renderSwitch('diagram', gate);
    expect(container.querySelector('[data-editor-mode-switch]')).toBeNull();
  });

  it('renders nothing outside an editor', () => {
    const { container } = render(<EditorModeSwitch />);
    expect(container.innerHTML).toBe('');
  });

  it('floats its menu in a portal, outside the menu card, and a press on it keeps it open', () => {
    const { container } = renderSwitch('diagram');
    fireEvent.click(chip());
    const menu = screen.getByRole('menu');
    expect(menu.hasAttribute('data-mode-menu')).toBe(true);
    expect(container.contains(menu)).toBe(false);
    expect(menu.className).toContain('fixed');
    fireEvent.pointerDown(menu);
    fireEvent.mouseDown(menu);
    expect(screen.queryByRole('menu')).not.toBeNull();
  });

  it('switches a tab between the three modes, and offers no other', () => {
    const { setMode } = renderSwitch('diagram');
    fireEvent.click(chip());
    expect(screen.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual([
      'Sketch',
      'Structured',
      'Pages',
    ]);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sketch' }));
    expect(setMode).toHaveBeenCalledWith('draw');
  });
});

describe('EditorModeSwitch beside the start switch', () => {
  // One mode, read and written by both, as the editor's EditorModeProvider gives it.
  function Both() {
    const [mode, setMode] = useState<EditorMode>('diagram');
    return (
      <EditorModeProvider
        value={{
          mode,
          setMode,
          canSwitch: true,
          canEdit: true,
          workshop: false,
          setWorkshop: vi.fn(),
        }}
      >
        <EditorModeSwitch />
        <StartModeSwitch />
      </EditorModeProvider>
    );
  }

  it('always agrees: a switch in either place shows in both', () => {
    render(<Both />);
    const start = () => screen.getByRole('button', { name: /^Tab mode:/ });
    fireEvent.click(chip());
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sketch' }));
    expect(chip().getAttribute('aria-label')).toBe('Editor mode: Sketch');
    expect(start().getAttribute('aria-label')).toBe('Tab mode: Sketch');
    fireEvent.click(start());
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Pages/ }));
    expect(chip().getAttribute('aria-label')).toBe('Editor mode: Pages');
    expect(start().getAttribute('aria-label')).toBe('Tab mode: Pages');
  });
});
