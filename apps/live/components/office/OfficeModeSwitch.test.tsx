// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { modesFor } from '@/lib/office/office-mode';
import { useOfficeMode } from '@/lib/office/useOfficeMode';
import { track } from '@/lib/telemetry';
import { OfficeModeSwitch } from './OfficeModeSwitch';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// docs/specs/034-text-documents/review.md "Editing modes"; editing-surface.md "The title row".
describe('OfficeModeSwitch', () => {
  it('names the mode, and lists the modes the level allows with what each does', () => {
    render(<OfficeModeSwitch mode="editing" modes={modesFor('edit')} onChange={vi.fn()} />);
    const pill = screen.getByRole('button', { name: 'Mode: Editing' });
    fireEvent.click(pill);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual([
      'EditingEdit document directly',
      'SuggestingComing soon',
      'ViewingRead or print final document',
    ]);
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');
    expect(items[1]!.getAttribute('aria-disabled')).toBe('true');
  });

  it('changes the mode on a choice, and never to one not yet built', () => {
    const onChange = vi.fn();
    render(<OfficeModeSwitch mode="editing" modes={modesFor('edit')} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mode: Editing' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Suggesting/ }));
    expect(onChange).not.toHaveBeenCalled();
    // The menu stays open on a dimmed row.
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Viewing/ }));
    expect(onChange).toHaveBeenCalledWith('viewing');
  });

  it('offers a Viewer Viewing alone', () => {
    render(<OfficeModeSwitch mode="viewing" modes={modesFor('view')} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mode: Viewing' }));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(1);
  });
});

describe('useOfficeMode', () => {
  it('starts an Editor in Editing and binds the built modes, checked as they are', () => {
    const { result } = renderHook(() => useOfficeMode('edit', 'TextDocumentMode'));
    expect(result.current.mode).toBe('editing');
    expect(Object.keys(result.current.actions)).toEqual(['mode-editing', 'mode-viewing']);
    expect(result.current.actions['mode-editing']!.checked).toBe(true);
    act(() => result.current.actions['mode-viewing']!.run());
    expect(result.current.mode).toBe('viewing');
    expect(result.current.actions['mode-viewing']!.checked).toBe(true);
    expect(track).toHaveBeenCalledWith('UI', 'Changed', 'TextDocumentMode');
  });

  it('starts a Participant and a Viewer in Viewing, binding Viewing alone', () => {
    for (const level of ['participate', 'view'] as const) {
      const { result } = renderHook(() => useOfficeMode(level, 'TextDocumentMode'));
      expect(result.current.mode).toBe('viewing');
      expect(Object.keys(result.current.actions)).toEqual(['mode-viewing']);
    }
  });

  it("falls back to the level's mode when the level no longer allows the one chosen", () => {
    const { result, rerender } = renderHook(
      ({ level }) => useOfficeMode(level, 'TextDocumentMode'),
      {
        initialProps: { level: 'edit' as 'edit' | 'view' },
      },
    );
    expect(result.current.mode).toBe('editing');
    rerender({ level: 'view' });
    expect(result.current.mode).toBe('viewing');
  });
});
