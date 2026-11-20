// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { track } from '@/lib/telemetry';
import type { OfficePanelSpec } from './office-panels';
import { readOfficePanelWidth, readOpenPanels } from './office-panel-store';
import { useOfficePanels } from './useOfficePanels';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const PANELS: OfficePanelSpec[] = [
  { id: 'outline', title: 'Outline', side: 'left', item: 'show-outline' },
];

function panels() {
  const onFocusDocument = vi.fn();
  const hook = renderHook(() =>
    useOfficePanels({ kind: 'TextDocument', panels: PANELS, onFocusDocument }),
  );
  return { hook, onFocusDocument };
}

// docs/specs/004-interface-design/office-shell.md "Side panels".
describe('useOfficePanels', () => {
  afterEach(() => localStorage.clear());

  it('opens a panel from its item, checked, remembered, and asks for focus', () => {
    const { hook } = panels();
    expect(hook.result.current.actions['show-outline']!.checked).toBe(false);
    act(() => hook.result.current.actions['show-outline']!.run());
    expect(hook.result.current.open.left).toBe('outline');
    expect(hook.result.current.actions['show-outline']!.checked).toBe(true);
    expect(hook.result.current.focusNonce).toBe(1);
    expect(readOpenPanels('TextDocument', PANELS).left).toBe('outline');
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TextDocumentPanelOutline');
  });

  it('closes it from its item again, giving the document the keyboard back', () => {
    const { hook, onFocusDocument } = panels();
    act(() => hook.result.current.actions['show-outline']!.run());
    act(() => hook.result.current.actions['show-outline']!.run());
    expect(hook.result.current.open.left).toBeNull();
    expect(onFocusDocument).toHaveBeenCalledTimes(1);
    expect(readOpenPanels('TextDocument', PANELS).left).toBeNull();
  });

  it('opens where it was left, without taking focus', () => {
    const first = panels();
    act(() => first.hook.result.current.actions['show-outline']!.run());
    first.hook.unmount();
    const { hook } = panels();
    expect(hook.result.current.open.left).toBe('outline');
    expect(hook.result.current.focusNonce).toBe(0);
  });

  it('keeps the width once a resize is done', () => {
    const { hook } = panels();
    act(() => hook.result.current.setWidth(420));
    expect(readOfficePanelWidth()).toBe(360);
    act(() => hook.result.current.saveWidth());
    expect(readOfficePanelWidth()).toBe(420);
  });
});
