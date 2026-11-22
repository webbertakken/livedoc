// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  createOfficeBindingsChannel,
  OfficeBindingsContext,
  useChannelBindings,
  usePublishedBindings,
} from './office-bindings-channel';

// docs/specs/029-sheets/surface.md "Menu bar": the open sheet's bindings reach the title row above it.
describe('createOfficeBindingsChannel', () => {
  it('tells its listeners only of a change the menus would draw, and runs the latest binding', () => {
    const channel = createOfficeBindingsChannel();
    const heard = vi.fn();
    const unsubscribe = channel.subscribe(heard);
    const first = vi.fn();
    const second = vi.fn();
    channel.set({ bold: { run: first, checked: false } });
    expect(heard).toHaveBeenCalledTimes(1);
    const shown = channel.get();
    channel.set({ bold: { run: second, checked: false } });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(channel.get()).toBe(shown);
    shown.bold!.run();
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    channel.set({ bold: { run: second, checked: true } });
    expect(heard).toHaveBeenCalledTimes(2);
    expect(channel.get().bold!.checked).toBe(true);
    channel.set({});
    shown.bold!.run();
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribe();
    channel.set({ cut: { run: first } });
    expect(heard).toHaveBeenCalledTimes(3);
  });
});

function Publisher({ actions }: { actions: OfficeActions }) {
  usePublishedBindings(actions);
  return null;
}

function Reader({
  channel,
  seen,
}: {
  channel: ReturnType<typeof createOfficeBindingsChannel>;
  seen: (a: OfficeActions) => void;
}) {
  seen(useChannelBindings(channel));
  return null;
}

describe('usePublishedBindings', () => {
  it('publishes the open sheet’s bindings and clears them when it goes', () => {
    const channel = createOfficeBindingsChannel();
    const seen = vi.fn<(actions: OfficeActions) => void>();
    const run = vi.fn();
    const view = render(
      <>
        <Reader channel={channel} seen={seen} />
        <OfficeBindingsContext.Provider value={channel}>
          <Publisher actions={{ copy: { run } }} />
        </OfficeBindingsContext.Provider>
      </>,
    );
    expect(Object.keys(seen.mock.lastCall![0])).toEqual(['copy']);
    act(() => view.rerender(<Reader channel={channel} seen={seen} />));
    expect(seen.mock.lastCall![0]).toEqual({});
  });

  it('publishes nothing outside a channel', () => {
    expect(() => render(<Publisher actions={{ copy: { run: () => {} } }} />)).not.toThrow();
  });
});
