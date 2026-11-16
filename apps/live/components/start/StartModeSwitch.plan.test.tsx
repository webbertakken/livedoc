// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorModeProvider } from '@/components/chrome/editor-mode/editor-mode-context';
import { StartModeSwitch } from './StartModeSwitch';

// A switch to Plan opens no start of this kind: Plan has Start Planning, always shown.
vi.mock('@/components/chrome/editor-mode/ModeMenuChip', () => ({
  ModeMenuChip: ({ onChange }: { onChange: (mode: string) => void }) => (
    <button type="button" onClick={() => onChange('plan')}>
      To Plan
    </button>
  ),
}));
vi.mock('@/lib/view-transition', () => ({
  startTypedTransition: (_type: string, change: () => void) => change(),
}));
afterEach(cleanup);

describe('StartModeSwitch to Plan', () => {
  it('switches without opening a start', () => {
    const setMode = vi.fn();
    const onSwitch = vi.fn();
    render(
      <EditorModeProvider
        value={{
          mode: 'diagram',
          setMode,
          canSwitch: true,
          canEdit: true,
          workshop: false,
          setWorkshop: vi.fn(),
        }}
      >
        <StartModeSwitch onSwitch={onSwitch} />
      </EditorModeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'To Plan' }));
    expect(setMode).toHaveBeenCalledWith('plan');
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
