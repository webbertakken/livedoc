// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));
import { PanelFindField, usePanelFind } from './PanelFind';

function Panel({ enabled = true }: { enabled?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const find = usePanelFind(root, enabled, 'Archive');
  return (
    <div data-tour-id="explorer">
      <div ref={root}>
        <button type="button" data-pane-row="">
          Roadmap 0001
        </button>
        {find.open ? (
          <PanelFindField find={find} folderName="Archive" matches={find.text ? 2 : null} />
        ) : null}
      </div>
    </div>
  );
}

const pressFind = (target: Element, mods: Partial<KeyboardEventInit> = { ctrlKey: true }) =>
  fireEvent.keyDown(target, { key: 'f', ...mods });

describe('the panel find', () => {
  it('opens on Ctrl F with the focus in the panel, focused, and closes on Escape back to the row', () => {
    render(<Panel />);
    const row = screen.getByRole('button', { name: 'Roadmap 0001' });
    act(() => row.focus());
    pressFind(row);
    const field = screen.getByRole('searchbox', { name: 'Find in Archive' });
    expect(document.activeElement).toBe(field);
    expect(track).toHaveBeenCalledWith('Explorer', 'Opened', 'PanelFind');
    fireEvent.change(field, { target: { value: 'road' } });
    expect(screen.getByRole('status').textContent).toBe('2 matches');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('opens on Cmd F too', () => {
    render(<Panel />);
    const row = screen.getByRole('button', { name: 'Roadmap 0001' });
    act(() => row.focus());
    pressFind(row, { metaKey: true });
    expect(screen.getByRole('searchbox', { name: 'Find in Archive' })).toBeTruthy();
  });

  it('leaves a second press to the browser', () => {
    render(<Panel />);
    const row = screen.getByRole('button', { name: 'Roadmap 0001' });
    act(() => row.focus());
    pressFind(row);
    const field = screen.getByRole('searchbox');
    const event = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves Ctrl F to the browser when the focus is outside the panel or the section has no list', () => {
    const { unmount } = render(<Panel />);
    const outside = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
    unmount();
    render(<Panel enabled={false} />);
    const row = screen.getByRole('button', { name: 'Roadmap 0001' });
    act(() => row.focus());
    pressFind(row);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('says when nothing matches', () => {
    function NoMatch() {
      const root = useRef<HTMLDivElement>(null);
      const find = usePanelFind(root, true, 'Archive');
      return (
        <div data-tour-id="explorer" ref={root}>
          <button type="button">Row</button>
          {find.open ? <PanelFindField find={find} folderName="Archive" matches={0} /> : null}
        </div>
      );
    }
    render(<NoMatch />);
    const row = screen.getByRole('button', { name: 'Row' });
    act(() => row.focus());
    pressFind(row);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByRole('status').textContent).toBe('No matches');
  });
});

describe('the panel find and the panel’s own Escape', () => {
  it('takes Escape first, so the panel stays open', () => {
    render(<Panel />);
    const row = screen.getByRole('button', { name: 'Roadmap 0001' });
    act(() => row.focus());
    pressFind(row);
    let panelSaw: boolean | null = null;
    const panelEscape = (e: KeyboardEvent) => {
      panelSaw = e.defaultPrevented;
    };
    document.addEventListener('keydown', panelEscape, true);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    document.removeEventListener('keydown', panelEscape, true);
    expect(panelSaw).toBe(true);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
