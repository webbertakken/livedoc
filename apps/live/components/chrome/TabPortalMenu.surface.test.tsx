// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { SplitViewContext } from '@/components/split/SplitViewContext';
import type { SplitView } from '@/hooks/ui/useSplitView';

// The tab menu's surface (docs/specs/007-editor/live-app.md "Tab menu", "Menus are bottom sheets on a phone"): where
// it sits, what closes it, the organise pickers it swaps to, Side by Side, and the phone's sheet.

const phone = vi.hoisted(() => ({ on: false }));
const clamp = vi.hoisted(() => ({ next: { x: 0, y: 0 } }));
vi.mock('@/hooks/ui/useIsMobileViewport', () => ({ useIsMobileViewport: () => phone.on }));
vi.mock('@/lib/clamp-to-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/clamp-to-viewport')>()),
  clampToViewport: () => clamp.next,
}));
vi.mock('@/components/dialogs/TabOrganiseDialogs', () => ({
  AddTabToFolderDialog: () => <div data-testid="folder-dialog" />,
  AddTabToDocumentDialog: () => <div data-testid="document-dialog" />,
}));

const { PortalMenu } = await import('./TabPortalMenu');

type Props = ComponentProps<typeof PortalMenu>;

function props(over: Partial<Props> = {}): Props {
  const noop = () => {};
  return {
    onClose: noop,
    onRename: noop,
    onDuplicate: noop,
    onClearContent: noop,
    onImport: noop,
    onExport: noop,
    onCopyTo: noop,
    onToggleLock: noop,
    locked: false,
    selfId: 'me',
    otherDocuments: [{ id: 'd2', name: 'Other' }],
    folderNames: [],
    currentFolder: null,
    onMoveToFolder: noop,
    onRemoveFromFolder: noop,
    onDelete: noop,
    deletion: { kind: 'tab' },
    canClearContent: true,
    ...over,
  };
}

const anchored = (over: Partial<Props> = {}) => {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  return render(<PortalMenu {...props({ anchor, ...over })} />);
};

let now = 0;
beforeEach(() => {
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  phone.on = false;
  clamp.next = { x: 0, y: 0 };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the tab menu: where it sits', () => {
  it('draws nothing with neither an anchor nor a point to sit at', () => {
    render(<PortalMenu {...props()} />);
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
  });

  it('nudges itself back on screen when it would overflow an edge', () => {
    clamp.next = { x: -12, y: 0 };
    anchored();
    const menu = document.querySelector<HTMLElement>('[data-tour-id="tab-menu"]')!;
    expect(menu.style.left).toBe('-12px');
  });

  // docs/specs/004-interface-design/motion.md "Context menus": it appears at once, with no fade and no cascade.
  it('appears at once, with no entrance motion', () => {
    anchored();
    const menu = document.querySelector<HTMLElement>('[data-tour-id="tab-menu"]')!;
    expect(menu.className).not.toMatch(/\banimate-|lvd-menu-stagger/);
  });
});

describe('the tab menu: what closes it', () => {
  it('closes on a press outside, once its grace window has passed', () => {
    const onClose = vi.fn();
    anchored({ onClose });
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    fireEvent.pointerDown(outside);
    expect(onClose).not.toHaveBeenCalled();
    now = 1000;
    fireEvent.pointerDown(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open for a press on its own confirm, its trigger, a tour or a flyout', () => {
    const onClose = vi.fn();
    anchored({ onClose });
    now = 1000;
    for (const mark of [
      'data-confirm-popover',
      'data-context-menu-trigger',
      'data-tour-popover',
      'data-menu-flyout',
    ]) {
      const el = document.createElement('div');
      el.setAttribute(mark, '');
      document.body.appendChild(el);
      fireEvent.pointerDown(el);
    }
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rename' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the tab menu: the organise pickers', () => {
  it('swaps to the folder picker from Add to Folder', () => {
    anchored();
    fireEvent.click(screen.getByRole('button', { name: 'Add to Folder' }));
    expect(screen.getByTestId('folder-dialog')).toBeTruthy();
  });

  it('swaps to the document picker from Add to Document', () => {
    anchored();
    fireEvent.click(screen.getByRole('button', { name: 'Add to Document' }));
    expect(screen.getByTestId('document-dialog')).toBeTruthy();
  });
});

describe('the tab menu: Side by Side', () => {
  const split = (over: Partial<SplitView>): SplitView =>
    ({
      available: true,
      pair: null,
      activeId: 'a',
      canOpen: () => true,
      open: vi.fn(),
      close: vi.fn(),
      ...over,
    }) as unknown as SplitView;

  it('opens this tab beside the other, and closes the split when one shows', () => {
    const onClose = vi.fn();
    const opening = split({});
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const { unmount } = render(
      <SplitViewContext.Provider value={opening}>
        <PortalMenu {...props({ anchor, onClose })} />
      </SplitViewContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Side by Side' }));
    expect(opening.open).toHaveBeenCalledWith('a', 'Menu');
    unmount();

    const closing = split({ pair: { left: 'a', right: 'b' } as unknown as SplitView['pair'] });
    render(
      <SplitViewContext.Provider value={closing}>
        <PortalMenu {...props({ anchor, onClose })} />
      </SplitViewContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close Side by Side' }));
    expect(closing.close).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('the tab menu on a phone', () => {
  it('rises as a sheet, its delete confirm beside it', () => {
    phone.on = true;
    anchored({
      deletion: {
        kind: 'document',
        confirm: { message: 'Delete this document?', confirmLabel: 'Delete Document' },
      },
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(screen.getByRole('dialog', { name: 'Delete this document?' })).toBeTruthy();
  });
});

describe('the tab menu: the rest of its surface', () => {
  it('re-clamps as its box changes size, where the browser can watch it', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let onResize: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          onResize = cb;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const { unmount } = anchored();
    expect(observe).toHaveBeenCalled();
    clamp.next = { x: 0, y: -30 };
    act(() => onResize());
    expect(document.querySelector<HTMLElement>('[data-tour-id="tab-menu"]')!.style.top).toBe(
      '-30px',
    );
    unmount();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('leaves dismissal to an open picker', () => {
    const onClose = vi.fn();
    anchored({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Folder' }));
    now = 1000;
    fireEvent.pointerDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('pastes from the tab ⋯ as a tool, greyed while nothing is copied', () => {
    const onPaste = vi.fn();
    const onClose = vi.fn();
    const { unmount } = anchored({ onClose, canvas: { onPaste, canPaste: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(onPaste).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    unmount();
    anchored({ canvas: { onPaste, canPaste: false } });
    expect(screen.getByRole('button', { name: 'Paste' })).toHaveProperty('disabled', true);
  });

  it('names Unlock Tab on a locked tab', () => {
    anchored({ locked: true, deletion: { kind: 'blocked', reason: 'This tab is locked.' } });
    expect(screen.getByRole('button', { name: 'Unlock Tab' })).toBeTruthy();
  });

  it('offers no Side by Side where this tab cannot open beside another', () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const none = {
      available: true,
      pair: null,
      activeId: 'a',
      canOpen: () => false,
    } as unknown as SplitView;
    render(
      <SplitViewContext.Provider value={none}>
        <PortalMenu {...props({ anchor })} />
      </SplitViewContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: 'Side by Side' })).toBeNull();
  });

  it('grows up from the footer button when asked, and keeps the browser menu away', () => {
    render(<PortalMenu {...props({ point: { x: 10, y: 20, openUp: true } })} />);
    const menu = document.querySelector<HTMLElement>('[data-tour-id="tab-menu"]')!;
    expect(menu.style.transform).toBe('translate(0px, calc(-100% - 4px))');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    menu.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps the browser menu away from the phone sheet too', () => {
    phone.on = true;
    anchored();
    const sheet = document.querySelector<HTMLElement>('[data-tour-id="tab-menu"]')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    sheet.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
