// @vitest-environment jsdom
// docs/specs/012-collaboration/review-surfaces.md "Version history": the frame (Back, the shown version's name or
// time), the panel (Current version first, versions grouped by day), the listbox's keys, Escape, and the states.
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfficeVersion } from '@/lib/office/office-version-list';
import {
  CURRENT_VERSION,
  OfficeVersionHistory,
  type OfficeShowChanges,
  type OfficeVersionWrites,
  VERSIONS_FAILED,
  VERSIONS_LOADING,
} from './OfficeVersionHistory';

afterEach(cleanup);

const now = new Date(2026, 10, 27, 9).getTime();
const VERSIONS: OfficeVersion[] = [
  {
    id: 'v2',
    kind: 'named',
    name: 'Draft',
    takenAt: new Date(2026, 10, 27, 8, 30).getTime(),
    restoredFrom: null,
    editors: [{ key: 'k', name: 'Ada', color: '#0284c7' }],
  },
  {
    id: 'v1',
    kind: 'automatic',
    name: null,
    takenAt: new Date(2026, 10, 26, 14, 5).getTime(),
    restoredFrom: null,
    editors: [],
  },
];

function Harness({
  versions = VERSIONS,
  failed = false,
  onClose = () => {},
  onRetry = () => {},
  writes = null,
  showChanges = null,
}: {
  versions?: OfficeVersion[] | null;
  failed?: boolean;
  onClose?: () => void;
  onRetry?: () => void;
  writes?: OfficeVersionWrites | null;
  showChanges?: OfficeShowChanges | null;
}) {
  const [selected, setSelected] = useState(CURRENT_VERSION);
  return (
    <OfficeVersionHistory
      versions={versions}
      failed={failed}
      selected={selected}
      now={now}
      status={null}
      onSelect={setSelected}
      onRetry={onRetry}
      onClose={onClose}
      writes={writes}
      showChanges={showChanges}
    >
      <p>drawn {selected}</p>
    </OfficeVersionHistory>
  );
}

const selectedName = () =>
  screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')!
    .textContent;

describe('OfficeVersionHistory', () => {
  it('lists Current version first, then the versions by day, and takes the keyboard', () => {
    render(<Harness />);
    expect(screen.getByRole('dialog', { name: 'Version history' })).toBeTruthy();
    const list = screen.getByRole('listbox', { name: 'Versions' });
    expect(document.activeElement).toBe(list);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Current version',
      'Draft08:30Ada',
      '14:05',
    ]);
    expect(
      within(screen.getByRole('group', { name: 'Today' })).getAllByRole('option'),
    ).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Yesterday' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Current version');
  });

  it('shows each version as the arrow keys reach it, and names it at the top', () => {
    render(<Harness />);
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selectedName()).toBe('Draft08:30Ada');
    expect(screen.getByText('drawn v2')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Draft');
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Yesterday, 14:05');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(screen.getByText('drawn v1')).toBeTruthy();
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    fireEvent.keyDown(list, { key: 'Home' });
    expect(selectedName()).toBe('Current version');
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
    fireEvent.keyDown(list, { key: 'a' });
    fireEvent.click(screen.getAllByRole('option')[2]!);
    expect(screen.getByText('drawn v1')).toBeTruthy();
  });

  it('leaves by Escape or Back', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('says while the versions load, and offers to try again when they cannot be read', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<Harness versions={null} />);
    expect(screen.getByText(VERSIONS_LOADING)).toBeTruthy();
    expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('true');
    rerender(<Harness versions={null} failed onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain(VERSIONS_FAILED);
    expect(screen.queryByText(VERSIONS_LOADING)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('says a status in the panel', () => {
    render(
      <OfficeVersionHistory
        versions={[]}
        failed={false}
        selected="gone"
        now={now}
        status="That didn’t work. Try again."
        onSelect={() => {}}
        onRetry={() => {}}
        onClose={() => {}}
      >
        {null}
      </OfficeVersionHistory>,
    );
    expect(screen.getByRole('status').textContent).toBe('That didn’t work. Try again.');
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
  });

  describe('naming and restoring (review.md "Version history")', () => {
    const writesOf = () => ({ name: vi.fn(), restore: vi.fn(), nameMax: 100 });
    const actionsOf = () => screen.getByRole('menu').querySelectorAll('[role="menuitem"]');
    const labels = () => [...actionsOf()].map((i) => i.textContent);

    it('opens a row’s menu from its ⋮ or Shift+F10, with what that row offers', () => {
      const writes = writesOf();
      render(<Harness writes={writes} />);
      const more = document.querySelectorAll<HTMLElement>('[data-version-actions]');
      expect(more).toHaveLength(3);
      fireEvent.click(more[1]!);
      expect(selectedName()).toContain('Draft');
      expect(screen.getByRole('menu', { name: 'Actions for Draft' })).toBeTruthy();
      expect(labels()).toEqual(['Rename', 'Remove name', 'Restore this version']);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove name' }));
      expect(writes.name).toHaveBeenCalledWith('v2', '');
      expect(screen.queryByRole('menu')).toBeNull();
      const list = screen.getByRole('listbox');
      fireEvent.keyDown(list, { key: 'End' });
      fireEvent.keyDown(list, { key: 'F10', shiftKey: true });
      expect(labels()).toEqual(['Name this version', 'Restore this version']);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Restore this version' }));
      expect(writes.restore).toHaveBeenCalledWith('v1');
      fireEvent.keyDown(list, { key: 'Home' });
      fireEvent.keyDown(list, { key: 'ContextMenu' });
      expect(labels()).toEqual(['Name this version']);
    });

    it('names in place: Enter keeps, pressing elsewhere keeps, Escape leaves, the frame staying open', () => {
      const writes = writesOf();
      const onClose = vi.fn();
      render(<Harness writes={writes} onClose={onClose} />);
      const list = screen.getByRole('listbox');
      fireEvent.keyDown(list, { key: 'ContextMenu' });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Name this version' }));
      const field = screen.getByRole('textbox', { name: 'Version name' });
      expect(document.activeElement).toBe(field);
      expect(field.getAttribute('placeholder')).toBe('09:00');
      fireEvent.change(field, { target: { value: '  Final  ' } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(writes.name).toHaveBeenCalledWith(CURRENT_VERSION, 'Final');
      expect(document.activeElement).toBe(list);

      fireEvent.keyDown(list, { key: 'ArrowDown' });
      fireEvent.keyDown(list, { key: 'ContextMenu' });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
      const rename = screen.getByRole('textbox', { name: 'Version name' });
      expect((rename as HTMLInputElement).value).toBe('Draft');
      fireEvent.keyDown(rename, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).toBeNull();

      fireEvent.keyDown(list, { key: 'ContextMenu' });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
      const again = screen.getByRole('textbox', { name: 'Version name' });
      fireEvent.change(again, { target: { value: 'Draft two' } });
      fireEvent.blur(again);
      expect(writes.name).toHaveBeenLastCalledWith('v2', 'Draft two');

      // Kept unchanged, nothing is written; an empty name on Current version names nothing.
      writes.name.mockClear();
      fireEvent.keyDown(list, { key: 'ContextMenu' });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      fireEvent.keyDown(list, { key: 'Home' });
      fireEvent.keyDown(list, { key: 'ContextMenu' });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Name this version' }));
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
      fireEvent.keyDown(list, { key: 'ContextMenu' });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Name this version' }));
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      fireEvent.keyDown(list, { key: 'End' });
      fireEvent.keyDown(list, { key: 'ContextMenu' });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Name this version' }));
      expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('14:05');
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
      expect(writes.name).not.toHaveBeenCalled();
    });

    it('closes a row’s menu on a press elsewhere, and offers none without writes', () => {
      render(<Harness writes={writesOf()} />);
      fireEvent.click(document.querySelectorAll<HTMLElement>('[data-version-actions]')[0]!);
      expect(screen.getByRole('menu')).toBeTruthy();
      fireEvent.pointerDown(document.body);
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('menu')).toBeNull();
      cleanup();
      render(<Harness />);
      expect(document.querySelectorAll('[data-version-actions]')).toHaveLength(0);
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ContextMenu' });
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  it('shows the named versions alone, and says whether changes are shown', () => {
    const onChange = vi.fn();
    render(<Harness showChanges={{ checked: true, onChange }} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Only show named versions' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Current version',
      'Draft08:30Ada',
    ]);
    const box = screen.getByRole('checkbox', { name: 'Show changes' });
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
