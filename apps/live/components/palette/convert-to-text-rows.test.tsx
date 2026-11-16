// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { packFreehandPoints, type BoxedElement, type Element } from '@livedoc/document';
import { MultiSelectionToolbar } from '@/components/canvas/MultiSelectionToolbar';
import { EditorContextMenu } from './EditorContextMenu';
import type { EditorContextMenuProps } from './EditorContextMenu.types';
import { MultiPlacementSections } from './MultiPlacementSections';

// docs/specs/023-draw-mode/ink-to-text.md "When it is offered": Convert to Text in a stroke's menu, a multi-selection's
// menu and the multi-selection toolbar, only where it is offered.
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const ink = {
  id: 'a',
  type: 'freehand',
  closed: false,
  ...packFreehandPoints([
    { x: 0, y: 0 },
    { x: 40, y: 20 },
  ]),
} as Element;

function strokeMenu(onConvertToText?: () => void) {
  const onClose = vi.fn();
  const given: Record<string, unknown> = {
    menu: { mode: 'element', elementId: 'a', x: 10, y: 10 },
    elements: [ink],
    onConvertToText,
    onClose,
  };
  const props = new Proxy(given, {
    get: (t, k: string) => (k in t ? t[k] : vi.fn()),
    has: () => true,
  }) as unknown as EditorContextMenuProps;
  const Host = () => EditorContextMenu(props);
  render(<Host />);
  return onClose;
}

describe('Convert to Text in a stroke’s menu', () => {
  it('runs and closes the menu', () => {
    const run = vi.fn();
    const onClose = strokeMenu(run);
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Text' }));
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it('is absent where it is not offered', () => {
    strokeMenu(undefined);
    expect(screen.queryByRole('button', { name: 'Convert to Text' })).toBeNull();
  });
});

describe('Convert to Text in a multi-selection’s menu', () => {
  function menu(onConvertToText?: () => void) {
    const onClose = vi.fn();
    render(
      <MultiPlacementSections
        props={{ onConvertToText } as unknown as EditorContextMenuProps}
        sel={[ink]}
        boxedSel={[ink as BoxedElement]}
        morphable={[]}
        sectionProps={() => ({ open: false, onToggle: () => {}, flush: true })}
        onClose={onClose}
      />,
    );
    return onClose;
  }

  it('runs and closes the menu', () => {
    const run = vi.fn();
    const onClose = menu(run);
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Text' }));
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it('is absent where it is not offered', () => {
    menu(undefined);
    expect(screen.queryByRole('button', { name: 'Convert to Text' })).toBeNull();
  });
});

describe('Convert to Text on the multi-selection toolbar', () => {
  const bar = (onConvertToText?: () => void) =>
    render(
      <MultiSelectionToolbar
        allLocked={false}
        selectedElements={[ink]}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onToggleLock={vi.fn()}
        onExport={vi.fn()}
        onConvertToText={onConvertToText}
      />,
    );

  it('is a button that converts', () => {
    const run = vi.fn();
    bar(run);
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Text' }));
    expect(run).toHaveBeenCalledOnce();
  });

  it('is absent where it is not offered', () => {
    bar(undefined);
    expect(screen.queryByRole('button', { name: 'Convert to Text' })).toBeNull();
  });
});
