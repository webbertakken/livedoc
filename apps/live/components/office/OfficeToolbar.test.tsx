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

  it("runs a toggle's double press in place of the second press of a double-click", () => {
    const { actions } = setup();
    const bold = screen.getByRole('button', { name: 'Bold' });
    const double = vi.fn();
    Object.assign(actions.bold, { double });
    fireEvent.click(bold, { detail: 1 });
    fireEvent.click(bold, { detail: 2 });
    expect(actions.bold.run).toHaveBeenCalledOnce();
    expect(double).toHaveBeenCalledOnce();
    // From the keyboard a press is always a plain press.
    fireEvent.click(bold, { detail: 0 });
    expect(actions.bold.run).toHaveBeenCalledTimes(2);
  });

  it('runs a second press as a press where the binding has no double press', () => {
    const { actions } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }), { detail: 2 });
    expect(actions.undo.run).toHaveBeenCalledOnce();
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

// docs/specs/004-interface-design/office-shell.md "Toolbar": a text field of the bar never traps the arrows.
describe('OfficeToolbar zoom field and the arrows', () => {
  it('moves in the text, and on past its ends to the next control', () => {
    setup();
    const field = screen.getByRole('combobox', { name: 'Zoom' });
    field.focus();
    const value = (field as HTMLInputElement).value;
    (field as HTMLInputElement).setSelectionRange(1, 1);
    fireEvent.keyDown(field, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(field);
    (field as HTMLInputElement).setSelectionRange(value.length, value.length);
    fireEvent.keyDown(field, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bold' }));
  });
});

// docs/specs/004-interface-design/office-shell.md "Phone and tablet".
describe('OfficeToolbar on a phone', () => {
  const phone = () =>
    render(
      <OfficeToolbar
        groups={GROUPS}
        actions={{ undo: { run: vi.fn() }, bold: { run: vi.fn() } }}
        shortcutOf={shortcutOf}
        zoom={null}
        phone
      />,
    );

  it('keeps every control in one row that scrolls, with no More', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(40);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(60);
    phone();
    const bar = screen.getByRole('toolbar', { name: 'Toolbar' });
    expect(within(bar).getByRole('button', { name: 'Bold' }).closest('[hidden]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(bar.className).toContain('overflow-x-auto');
  });

  it('docks just above the on-screen keyboard while it is up', () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 400,
      width: 390,
      offsetTop: 0,
      offsetLeft: 0,
    });
    vi.stubGlobal('visualViewport', viewport);
    try {
      phone();
      const dock = screen.getByRole('toolbar', { name: 'Toolbar' }).parentElement!;
      expect(dock.dataset.officeToolbarDocked).toBe('true');
      expect(dock.style.top).toBe('400px');
      expect(dock.style.width).toBe('390px');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// docs/specs/004-interface-design/office-shell.md "Toolbar", value fields; text-and-paragraphs.md "Text formatting".
describe('OfficeToolbar font size', () => {
  const SIZE_GROUPS: OfficeToolbarGroup[] = [
    {
      id: 'font',
      label: 'Font',
      controls: [
        {
          id: 'font-size',
          label: 'Font size',
          level: 'edit',
          status: 'built',
          look: { kind: 'fontSize' },
        },
      ],
    },
    ...GROUPS.slice(2),
  ];

  function sized(read: () => number | null) {
    const fontSize = { read, set: vi.fn() };
    const listeners = new Set<() => void>();
    const refresh = (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    const bold = { run: vi.fn(), checked: false };
    render(
      <OfficeToolbar
        groups={SIZE_GROUPS}
        actions={{ bold }}
        shortcutOf={shortcutOf}
        zoom={null}
        fontSize={fontSize}
        refresh={refresh}
      />,
    );
    const field = screen.getByRole('combobox', { name: 'Font size' });
    return { fontSize, field, bold, notify: () => act(() => listeners.forEach((l) => l())) };
  }

  it('shows the size at the caret, blank when mixed, and redraws when told', () => {
    let size: number | null = 11;
    const { field, bold, notify } = sized(() => size);
    expect((field as HTMLInputElement).value).toBe('11');
    size = null;
    bold.checked = true;
    notify();
    expect((field as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('applies a typed size on Enter, and puts back one out of range', () => {
    const { fontSize, field } = sized(() => 11);
    fireEvent.change(field, { target: { value: '10.5' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(fontSize.set).toHaveBeenCalledWith(10.5);
    fireEvent.change(field, { target: { value: '401' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(fontSize.set).toHaveBeenCalledOnce();
    expect((field as HTMLInputElement).value).toBe('11');
  });

  it('opens Google’s steps from a press on the field, at the size there is, and takes one', () => {
    const { fontSize, field } = sized(() => 11);
    expect(screen.queryByRole('button', { name: 'Font sizes' })).toBeNull();
    fireEvent.click(field);
    const list = screen.getByRole('listbox', { name: 'Font size' });
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '14',
      '18',
      '24',
      '30',
      '36',
      '48',
      '60',
      '72',
      '96',
    ]);
    expect(options[5]!.getAttribute('aria-selected')).toBe('true');
    expect(field.getAttribute('aria-activedescendant')).toBe(options[5]!.id);
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(fontSize.set).toHaveBeenCalledWith(12);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it("draws its list over the page, out of the toolbar's clipping, and takes a pressed step", () => {
    const { fontSize, field } = sized(() => 11);
    fireEvent.click(field);
    const list = screen.getByRole('listbox', { name: 'Font size' });
    expect(screen.getByRole('toolbar', { name: 'Toolbar' }).contains(list)).toBe(false);
    expect(list.closest('.office-shell')).not.toBeNull();
    const step = within(list).getByRole('option', { name: '24' });
    fireEvent.pointerDown(step);
    fireEvent.click(step);
    expect(fontSize.set).toHaveBeenCalledWith(24);
  });

  it('marks no step for a size off the list, and closes it with Escape', () => {
    const { field } = sized(() => 9.5);
    fireEvent.click(field);
    expect(
      screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true'),
    ).toBe(false);
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
