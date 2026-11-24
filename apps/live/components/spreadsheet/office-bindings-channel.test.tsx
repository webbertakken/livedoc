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
  recentCodes: readonly string[] = [],
  colours: GridOffice['colours'] = null,
  fontFamily: string | null = null,
  setFontFamily: (family: string) => void = () => {},
): GridOffice => ({
  actions,
  colours,
  recentCodes,
  fontSize,
  setFontSize,
  fontFamily,
  setFontFamily,
});

// docs/specs/029-sheets/surface.md "Menu bar", "Toolbar": the open sheet's bindings reach the title row above it.
// formatting.md "Number formats" (D194): a change of the recently used codes alone is heard.
describe('createOfficeBindingsChannel', () => {
  it('tells its listeners only of a change the shell would draw, and runs the latest binding', () => {
    const channel = createOfficeBindingsChannel();
    expect(channel.get()).toBe(NO_GRID_OFFICE);
    expect(() => NO_GRID_OFFICE.setFontSize(12)).not.toThrow();
    expect(() => NO_GRID_OFFICE.setFontFamily('Lora')).not.toThrow();
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

  it('carries the active cell’s family, set through the latest sheet (formatting.md "Font")', () => {
    const channel = createOfficeBindingsChannel();
    const heard = vi.fn();
    channel.subscribe(heard);
    const before = vi.fn();
    const after = vi.fn();
    channel.set(office({}, 10, undefined, [], null, 'Arial', before));
    const shown = channel.get();
    expect(shown.fontFamily).toBe('Arial');
    channel.set(office({}, 10, undefined, [], null, 'Arial', after));
    expect(heard).toHaveBeenCalledTimes(1);
    shown.setFontFamily('Lora');
    expect(after).toHaveBeenCalledWith('Lora');
    expect(before).not.toHaveBeenCalled();
    channel.set(office({}, 10, undefined, [], null, 'Lora', after));
    expect(heard).toHaveBeenCalledTimes(2);
    expect(channel.get().fontFamily).toBe('Lora');
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

  it('hears a change of the recently used codes alone, and carries them', () => {
    const channel = createOfficeBindingsChannel();
    const heard = vi.fn();
    channel.subscribe(heard);
    channel.set(office({}, null, () => {}, ['0.0']));
    channel.set(office({}, null, () => {}, ['0.0']));
    channel.set(office({}, null, () => {}, ['0.00']));
    expect(heard).toHaveBeenCalledTimes(2);
    expect(channel.get().recentCodes).toEqual(['0.00']);
  });

  // formatting.md "Text and colour": a colour control shows the active cell's colour and sets through the latest.
  it('redraws on a change of colour alone, reading and setting through the latest', () => {
    const channel = createOfficeBindingsChannel();
    const heard = vi.fn();
    channel.subscribe(heard);
    const colours = (fc: string | undefined, set = vi.fn()) => ({
      'text-colour': { read: () => fc, set, leading: 'Reset' },
    });
    channel.set(office({}, null, () => {}, [], colours('#ff0000')));
    channel.set(office({}, null, () => {}, [], colours('#ff0000')));
    const set = vi.fn();
    channel.set(office({}, null, () => {}, [], colours('#00ff00', set)));
    expect(heard).toHaveBeenCalledTimes(2);
    const shown = channel.get().colours!['text-colour']!;
    expect(shown.read()).toBe('#00ff00');
    shown.set('#0000ff');
    expect(set).toHaveBeenCalledWith('#0000ff');
    channel.set(office({}));
    expect(channel.get().colours).toBeNull();
    expect(shown.read()).toBeUndefined();
    shown.set(null);
  });
});
