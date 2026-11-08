// @vitest-environment jsdom

// Landing on a brainstorm about to start (docs/specs/009-elements/mind-node.md "A lone root opens selected"): its one
// mind node is selected, once per landing, for a session that may write its label.

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createShape, type Element } from '@livedoc/document';
import { useLoneRootLanding } from './useLoneRootLanding';

const root: Element = { ...createShape('mind-node', 0, 0), id: 'root' };
const child: Element = { ...createShape('mind-node', 0, 0), id: 'child', mindParentId: 'root' };
const box: Element = { ...createShape('square', 0, 0), id: 'box' };

type Props = {
  activeId: string;
  tabLoaded: boolean;
  elements: readonly Element[];
  mayWrite?: (el: Element) => boolean;
};

function setup(initial: Props) {
  let selected: string | null = null;
  const select = vi.fn((update: (current: string | null) => string | null) => {
    selected = update(selected);
  });
  const hook = renderHook(
    (p: Props) => useLoneRootLanding({ hydrated: true, mayWrite: () => true, select, ...p }),
    { initialProps: initial },
  );
  return { ...hook, select, selected: () => selected };
}

describe('useLoneRootLanding', () => {
  it('selects the lone root of the tab it lands on', () => {
    const { selected } = setup({ activeId: 't1', tabLoaded: true, elements: [root] });
    expect(selected()).toBe('root');
  });

  it('waits for the tab’s content to load', () => {
    const { rerender, selected } = setup({ activeId: 't1', tabLoaded: false, elements: [] });
    expect(selected()).toBeNull();
    rerender({ activeId: 't1', tabLoaded: true, elements: [root] });
    expect(selected()).toBe('root');
  });

  it('selects once per landing, so a selection cleared afterwards stays cleared', () => {
    const { rerender, select } = setup({ activeId: 't1', tabLoaded: true, elements: [root] });
    rerender({ activeId: 't1', tabLoaded: true, elements: [{ ...root, label: 'Trip' }] });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('selects again on landing back on the tab', () => {
    const { rerender, select } = setup({ activeId: 't1', tabLoaded: true, elements: [root] });
    rerender({ activeId: 't2', tabLoaded: true, elements: [box] });
    rerender({ activeId: 't1', tabLoaded: true, elements: [root] });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('leaves a tab with more than a lone root alone', () => {
    const { select } = setup({ activeId: 't1', tabLoaded: true, elements: [root, child] });
    expect(select).not.toHaveBeenCalled();
  });

  it('never claims the lone root for a session that may not write it', () => {
    const { select } = setup({
      activeId: 't1',
      tabLoaded: true,
      elements: [root],
      mayWrite: () => false,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('keeps a selection already made', () => {
    let selected: string | null = 'other';
    renderHook(() =>
      useLoneRootLanding({
        hydrated: true,
        activeId: 't1',
        tabLoaded: true,
        elements: [root],
        mayWrite: () => true,
        select: (update) => {
          selected = update(selected);
        },
      }),
    );
    expect(selected).toBe('other');
  });
});
