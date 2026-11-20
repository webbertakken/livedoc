// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { OfficeToolbarGroup } from '@/lib/office/office-toolbar';
import { OfficeToolbar } from './OfficeToolbar';
import type { OfficeZoom } from './OfficeZoomField';

const icon = { kind: 'icon', icon: [] } as const;
const GROUPS: OfficeToolbarGroup[] = [
  {
    id: 'history',
    label: 'History',
    controls: [
      { id: 'undo', label: 'Undo', level: 'edit', status: 'built', shortcut: 'undo', look: icon },
      { id: 'print', label: 'Print', level: 'edit', status: 'comingSoon', look: icon },
    ],
  },
  {
    id: 'zoom',
    label: 'Zoom',
    controls: [
      { id: 'zoom', label: 'Zoom', level: 'view', status: 'built', look: { kind: 'zoom' } },
    ],
  },
  {
    id: 'text',
    label: 'Text',
    controls: [
      {
        id: 'bold',
        label: 'Bold',
        level: 'edit',
        status: 'built',
        look: { ...icon, toggle: true },
      },
    ],
  },
];

const shortcutOf = (id: string) => (id === 'undo' ? { shown: 'Ctrl+Z', aria: 'Control+Z' } : null);

function setup(over: { zoom?: OfficeZoom } = {}) {
  const actions = { undo: { run: vi.fn() }, bold: { run: vi.fn(), checked: true } };
  const zoom = over.zoom ?? { value: 100 as const, onChange: vi.fn() };
  render(<OfficeToolbar groups={GROUPS} actions={actions} shortcutOf={shortcutOf} zoom={zoom} />);
  return { actions, zoom };
}

afterEach(() => vi.restoreAllMocks());

// docs/specs/004-interface-design/office-shell.md "Toolbar".
describe('OfficeToolbar', () => {
  it('is one toolbar with one tab stop, its controls named', () => {
    setup();
    const bar = screen.getByRole('toolbar', { name: 'Toolbar' });
    const undo = within(bar).getByRole('button', { name: 'Undo' });
    expect(undo.tabIndex).toBe(0);
    expect(within(bar).getByRole('button', { name: 'Print' }).tabIndex).toBe(-1);
    expect(undo.getAttribute('aria-keyshortcuts')).toBe('Control+Z');
  });

  it('runs a built control, and leaves a coming-soon one dimmed and inert', () => {
    const { actions } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(actions.undo.run).toHaveBeenCalledOnce();
    const print = screen.getByRole('button', { name: 'Print' });
    expect(print.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(print);
  });

  it('shows a toggle pressed from its binding', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('moves between controls with Left and Right, wrapping, and Home and End', () => {
    setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    fireEvent.keyDown(undo, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Print' }));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(undo);
    fireEvent.keyDown(undo, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(undo);
  });

  it('moves the controls that do not fit, from the right, behind More, in order', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(40);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(16 + 40 + 40 + 9 + 32);
    setup();
    const more = screen.getByRole('button', { name: 'More' });
    expect(screen.getByRole('button', { name: 'Undo' }).closest('[hidden]')).toBeNull();
    fireEvent.click(more);
    const second = screen.getByRole('toolbar', { name: 'More tools' });
    expect(within(second).getByRole('combobox', { name: 'Zoom' })).toBeTruthy();
    expect(within(second).getByRole('button', { name: 'Bold' })).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('toolbar', { name: 'More tools' })).toBeNull();
  });
});

// docs/specs/034-text-documents/editing-surface.md "Zoom".
describe('the zoom field', () => {
  it('applies a typed value on Enter, and puts back one out of range', () => {
    const onChange = vi.fn();
    setup({ zoom: { value: 100, onChange } });
    const field = screen.getByRole<HTMLInputElement>('combobox', { name: 'Zoom' });
    expect(field.value).toBe('100%');
    fireEvent.change(field, { target: { value: '150' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(150);
    fireEvent.change(field, { target: { value: '400' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(field.value).toBe('100%');
  });

  it('opens its list with Down, moves through it, and takes one on Enter', () => {
    const onChange = vi.fn();
    setup({ zoom: { value: 100, onChange } });
    const field = screen.getByRole('combobox', { name: 'Zoom' });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Fit',
      '50%',
      '75%',
      '90%',
      '100%',
      '125%',
      '150%',
      '200%',
    ]);
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(125);
  });

  it('takes Fit from the list by a press', () => {
    const onChange = vi.fn();
    setup({ zoom: { value: 100, onChange } });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom levels' }));
    fireEvent.click(screen.getByRole('option', { name: 'Fit' }));
    expect(onChange).toHaveBeenCalledWith('fit');
  });
});
