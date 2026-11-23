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
  { id: 'numbers', title: 'Line numbers', side: 'right', item: 'line-numbers', editorsOnly: true },
];

function panels(writes = true) {
  const onFocusDocument = vi.fn();
  const hook = renderHook(
    (props: { writes: boolean }) =>
      useOfficePanels({
        kind: 'TextDocument',
        panels: PANELS,
        onFocusDocument,
        writes: props.writes,
      }),
    { initialProps: { writes } },
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

  // "Side panels": a panel's telemetry name is its title's words joined, each capitalised.
  it('names a panel of several words to telemetry in capitalised words', () => {
    const { hook } = panels();
    act(() => hook.result.current.actions['line-numbers']!.run());
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TextDocumentPanelLineNumbers');
  });

  it("keeps a PDF document's panels apart from a text document's", () => {
    const hook = renderHook(() =>
      useOfficePanels({ kind: 'PdfDocument', panels: PANELS, onFocusDocument: vi.fn() }),
    );
    act(() => hook.result.current.actions['show-outline']!.run());
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'PdfDocumentPanelOutline');
    expect(readOpenPanels('PdfDocument', PANELS).left).toBe('outline');
    expect(readOpenPanels('TextDocument', PANELS).left).toBeNull();
  });

  // A shortcut that puts focus in a panel: the one open, else the one it names, opened.
  it('reveals a panel: opened where it is closed, focused either way', () => {
    const { hook } = panels();
    act(() => hook.result.current.reveal(PANELS[0]!));
    expect(hook.result.current.open.left).toBe('outline');
    expect(hook.result.current.focusNonce).toBe(1);
    act(() => hook.result.current.reveal(PANELS[0]!));
    expect(hook.result.current.open.left).toBe('outline');
    expect(hook.result.current.focusNonce).toBe(2);
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

  it("offers an Editor's panel only to a session that writes, hidden where it was left open", () => {
    const { hook } = panels();
    act(() => hook.result.current.actions['line-numbers']!.run());
    expect(hook.result.current.open.right).toBe('numbers');
    hook.rerender({ writes: false });
    expect(hook.result.current.actions['line-numbers']).toBeUndefined();
    expect(hook.result.current.actions['show-outline']).toBeDefined();
    expect(hook.result.current.open.right).toBeNull();
    hook.rerender({ writes: true });
    expect(hook.result.current.open.right).toBe('numbers');
  });

  it('keeps the width once a resize is done', () => {
    const { hook } = panels();
    act(() => hook.result.current.setWidth(420));
    expect(readOfficePanelWidth()).toBe(360);
    act(() => hook.result.current.saveWidth());
    expect(readOfficePanelWidth()).toBe(420);
  });
});
