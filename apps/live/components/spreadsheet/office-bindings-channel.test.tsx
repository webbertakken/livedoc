// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  createOfficeBindingsChannel,
  NO_GRID_OFFICE,
  OfficeBindingsContext,
  useChannelBindings,
  usePublishedBindings,
  type GridOffice,
} from './office-bindings-channel';

const office = (
  actions: OfficeActions,
  fontSize: number | null = null,
  setFontSize: (pt: number) => void = () => {},
): GridOffice => ({ actions, fontSize, setFontSize });

// docs/specs/029-sheets/surface.md "Menu bar", "Toolbar": the open sheet's bindings reach the title row above it.
describe('createOfficeBindingsChannel', () => {
  it('tells its listeners only of a change the shell would draw, and runs the latest binding', () => {
    const channel = createOfficeBindingsChannel();
    expect(channel.get()).toBe(NO_GRID_OFFICE);
    expect(() => NO_GRID_OFFICE.setFontSize(12)).not.toThrow();
    const heard = vi.fn();
    const unsubscribe = channel.subscribe(heard);
    const first = vi.fn();
    const second = vi.fn();
    channel.set(office({ bold: { run: first, checked: false } }));
    expect(heard).toHaveBeenCalledTimes(1);
    const shown = channel.get();
    channel.set(office({ bold: { run: second, checked: false } }));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(channel.get()).toBe(shown);
    shown.actions.bold!.run();
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    channel.set(office({ bold: { run: second, checked: true } }));
    expect(heard).toHaveBeenCalledTimes(2);
    expect(channel.get().actions.bold!.checked).toBe(true);
    channel.set(NO_GRID_OFFICE);
    shown.actions.bold!.run();
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribe();
    channel.set(office({ cut: { run: first } }));
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it('carries the active cell’s font size, set through the latest sheet', () => {
    const channel = createOfficeBindingsChannel();
    const heard = vi.fn();
    channel.subscribe(heard);
    const before = vi.fn();
    const after = vi.fn();
    channel.set(office({}, 10, before));
    const shown = channel.get();
    expect(shown.fontSize).toBe(10);
    channel.set(office({}, 10, after));
    expect(heard).toHaveBeenCalledTimes(1);
    shown.setFontSize(14);
    expect(after).toHaveBeenCalledWith(14);
    expect(before).not.toHaveBeenCalled();
    channel.set(office({}, 14, after));
    expect(heard).toHaveBeenCalledTimes(2);
    expect(channel.get().fontSize).toBe(14);
  });
});

function Publisher({ actions }: { actions: OfficeActions }) {
  usePublishedBindings(office(actions));
  return null;
}

function Reader({
  channel,
  seen,
}: {
  channel: ReturnType<typeof createOfficeBindingsChannel>;
  seen: (a: GridOffice) => void;
}) {
  seen(useChannelBindings(channel));
  return null;
}

describe('usePublishedBindings', () => {
  it('publishes the open sheet’s bindings and clears them when it goes', () => {
    const channel = createOfficeBindingsChannel();
    const seen = vi.fn<(office: GridOffice) => void>();
    const run = vi.fn();
    const view = render(
      <>
        <Reader channel={channel} seen={seen} />
        <OfficeBindingsContext.Provider value={channel}>
          <Publisher actions={{ copy: { run } }} />
        </OfficeBindingsContext.Provider>
      </>,
    );
    expect(Object.keys(seen.mock.lastCall![0].actions)).toEqual(['copy']);
    act(() => view.rerender(<Reader channel={channel} seen={seen} />));
    expect(seen.mock.lastCall![0]).toBe(NO_GRID_OFFICE);
  });

  it('publishes nothing outside a channel', () => {
    expect(() => render(<Publisher actions={{ copy: { run: () => {} } }} />)).not.toThrow();
  });
});
