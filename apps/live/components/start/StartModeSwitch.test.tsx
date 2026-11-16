// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorMode } from '@livedoc/document';
import { EditorModeProvider } from '@/components/chrome/editor-mode/editor-mode-context';
import { StartModeSwitch, startModeFor } from './StartModeSwitch';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
const transition = vi.hoisted(() => vi.fn((_type: string, change: () => void) => change()));
vi.mock('@/lib/view-transition', () => ({ startTypedTransition: transition }));
vi.mock('@/hooks/ui/useConfirm', () => ({ useConfirm: () => async () => true }));
afterEach(cleanup);

// docs/specs/007-editor/start-diagramming.md "Changing mode"
const mount = (
  mode: EditorMode,
  canEdit = true,
  onSwitch?: (start: string) => void,
  workshop = false,
) => {
  const setMode = vi.fn();
  render(
    <EditorModeProvider
      value={{ mode, setMode, canSwitch: true, canEdit, workshop, setWorkshop: vi.fn() }}
    >
      <StartModeSwitch onSwitch={onSwitch} />
    </EditorModeProvider>,
  );
  return setMode;
};

describe('StartModeSwitch', () => {
  it('names the mode and opens its menu, switching the tab', () => {
    const setMode = mount('diagram');
    const chip = screen.getByRole('button', { name: /^Tab mode: Structured/ });
    expect(chip.textContent).toContain('Structured');
    fireEvent.click(chip);
    expect(screen.getByRole('menu').className).toMatch(/top-full/);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Pages/ }));
    expect(setMode).toHaveBeenCalledWith('pages');
  });

  it('switches inside a start-mode transition, so the start cross-fades', () => {
    const setMode = mount('diagram');
    fireEvent.click(screen.getByRole('button', { name: /^Tab mode: Structured/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Pages/ }));
    expect(transition).toHaveBeenCalledWith('start-mode', expect.any(Function));
    expect(setMode).toHaveBeenCalledOnce();
  });

  // docs/specs/007-editor/start-diagramming.md "When it shows": still choosing, so the next mode's start opens too.
  it('tells which start the next mode opens on, before switching', () => {
    const onSwitch = vi.fn();
    const setMode = mount('diagram', true, onSwitch);
    fireEvent.click(screen.getByRole('button', { name: /^Tab mode: Structured/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Sketch/ }));
    expect(onSwitch).toHaveBeenCalledWith('draw');
    expect(onSwitch.mock.invocationCallOrder[0]).toBeLessThan(setMode.mock.invocationCallOrder[0]!);
  });

  it('switches without a listener', () => {
    const setMode = mount('pages');
    fireEvent.click(screen.getByRole('button', { name: /^Tab mode: Pages/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Structured/ }));
    expect(setMode).toHaveBeenCalledWith('diagram');
  });

  it('shows nothing to someone who cannot edit', () => {
    mount('diagram', false);
    expect(screen.queryByRole('button', { name: /^Tab mode:/ })).toBeNull();
  });
});

describe('startModeFor', () => {
  it('is the mode, Start a Workshop for Structured with the Workshop control on, none for Plan', () => {
    expect(startModeFor('draw', true)).toBe('draw');
    expect(startModeFor('pages', false)).toBe('pages');
    expect(startModeFor('diagram', false)).toBe('diagram');
    expect(startModeFor('diagram', true)).toBe('workshop');
    expect(startModeFor('plan', false)).toBeNull();
  });
});
