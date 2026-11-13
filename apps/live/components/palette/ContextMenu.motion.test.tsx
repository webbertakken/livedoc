// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// docs/specs/004-interface-design/motion.md "Context menus": the element, selection and cell menus appear at once,
// with no fade and no cascade of their rows.

vi.mock('@/hooks/ui/useIsMobileViewport', () => ({ useIsMobileViewport: () => false }));

const { ContextMenu } = await import('./ContextMenu');

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function openMenu() {
  render(
    <ContextMenu position={{ x: 40, y: 60 }} label="Element menu" onClose={() => {}}>
      <button type="button">Duplicate</button>
      <button type="button">Delete</button>
    </ContextMenu>,
  );
  return document.querySelector<HTMLElement>('[data-context-menu]')!;
}

describe('the context menu', () => {
  it('appears at once, with no entrance motion', () => {
    const menu = openMenu();
    expect(menu.className).not.toMatch(/\banimate-|lvd-menu-stagger/);
  });
});
