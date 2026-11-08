// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShape, type Element } from '@livedoc/document';
import { MindArrangeButtons, mindArrangeState } from './MindArrangeButtons';

// docs/specs/009-elements/mind-node.md "Numbered nodes", "Groups", "A tidy map stays tidy".

afterEach(() => cleanup());

const node = (id: string, extra: Record<string, unknown> = {}) =>
  ({ ...createShape('mind-node', 0, 0), id, mindParentId: 'r', ...extra }) as Element;

describe('MindArrangeButtons', () => {
  it('offers nothing for a root alone or a plain shape', () => {
    expect(mindArrangeState([{ ...createShape('mind-node', 0, 0), id: 'r' }])).toBeNull();
    expect(mindArrangeState([{ ...createShape('square', 0, 0), id: 's' }])).toBeNull();
  });

  it('numbers, groups and, for a node placed by hand, puts it back', () => {
    const actions = { number: vi.fn(), group: vi.fn(), ungroup: vi.fn(), autoPosition: vi.fn() };
    const state = mindArrangeState([node('a', { mindPlaced: true }), node('b')])!;
    render(<MindArrangeButtons state={state} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Number' }));
    fireEvent.click(screen.getByRole('button', { name: 'Group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Auto Position' }));
    expect(actions.number).toHaveBeenCalledWith(true);
    expect(actions.group).toHaveBeenCalledOnce();
    expect(actions.autoPosition).toHaveBeenCalledOnce();
  });

  it('offers Ungroup and an unnumbering Number for a numbered group', () => {
    const actions = { number: vi.fn(), group: vi.fn(), ungroup: vi.fn(), autoPosition: vi.fn() };
    const state = mindArrangeState([
      node('a', { mindGroup: 'g', mindNumbered: true }),
      node('b', { mindGroup: 'g', mindNumbered: true }),
    ])!;
    render(<MindArrangeButtons state={state} actions={actions} />);
    const number = screen.getByRole('button', { name: 'Number' });
    expect(number.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(number);
    fireEvent.click(screen.getByRole('button', { name: 'Ungroup' }));
    expect(actions.number).toHaveBeenCalledWith(false);
    expect(actions.ungroup).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Auto Position' })).toBeNull();
  });
});
