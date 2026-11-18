// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useStripPlacement, type StripPlacement } from './useStripPlacement';

// docs/specs/007-editor/toolbar-layout.md "When a line runs out of room": the strip sits centred while it fits
// centred, off centre between the brand and actions groups while it fits there, and takes its own row only after.

let fire: () => void = () => {};
// The brand group 12..185, the actions group ending 12 from the right, 200 wide unless a test widens it.
const BRAND_RIGHT = 185;
let actionsWidth = 200;

function group(attr: string, rect: () => DOMRect) {
  const el = document.createElement('div');
  el.setAttribute(attr, '');
  vi.spyOn(el, 'getBoundingClientRect').mockImplementation(rect);
  document.body.append(el);
}

beforeEach(() => {
  globalThis.ResizeObserver = class {
    constructor(cb: () => void) {
      fire = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  actionsWidth = 200;
  group('data-toolbar-menu', () => new DOMRect(12, 12, BRAND_RIGHT - 12, 46));
  group(
    'data-toolbar-actions',
    () => new DOMRect(window.innerWidth - 12 - actionsWidth, 12, actionsWidth, 46),
  );
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

// Rendered where the test can read it without act: what the frame would draw.
function Shown({ width }: { width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { crowded } = useStripPlacement(ref, true, String(width));
  return (
    <div
      data-testid="strip"
      data-crowded={String(crowded)}
      ref={(el) => {
        ref.current = el;
        if (el) el.getBoundingClientRect = () => new DOMRect(0, 12, width, 46);
      }}
    />
  );
}

function Strip({
  width,
  enabled = true,
  seen,
}: {
  width: number;
  enabled?: boolean;
  seen: StripPlacement[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  // What it draws: here only its width, as tiles dropping change it.
  seen.push(useStripPlacement(ref, enabled, String(width)));
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el) el.getBoundingClientRect = () => new DOMRect(0, 12, width, 46);
      }}
    />
  );
}

const at = (w: number) => {
  vi.stubGlobal('innerWidth', w);
  act(() => fire());
};

describe('useStripPlacement', () => {
  it('centres the strip on the line while it fits centred (1440)', () => {
    vi.stubGlobal('innerWidth', 1440);
    const seen: StripPlacement[] = [];
    render(<Strip width={600} seen={seen} />);
    expect(seen.at(-1)).toEqual({ crowded: false, shift: 0 });
  });

  // Centred, the strip takes no shift at all, whatever its width; only an off-centre strip lands on a whole pixel.
  it('centres a strip of odd width with no shift (1440)', () => {
    vi.stubGlobal('innerWidth', 1440);
    const seen: StripPlacement[] = [];
    render(<Strip width={601} seen={seen} />);
    expect(seen.at(-1)).toEqual({ crowded: false, shift: 0 });
  });

  it('lands an off-centre strip of fractional width on a whole pixel (864)', () => {
    vi.stubGlobal('innerWidth', 864);
    const seen: StripPlacement[] = [];
    render(<Strip width={440.5} seen={seen} />);
    const { shift } = seen.at(-1)!;
    expect(Number.isInteger(432 + shift - 440.5 / 2)).toBe(true);
  });

  it('slides it off centre between the groups when centred would run under one (864)', () => {
    vi.stubGlobal('innerWidth', 864);
    const seen: StripPlacement[] = [];
    // Room: 864 - 12 - 200 - 8 = 644 on the right, 185 + 8 = 193 on the left: 451 between.
    render(<Strip width={440} seen={seen} />);
    const placed = seen.at(-1)!;
    expect(placed.crowded).toBe(false);
    // Pressed against the actions group's gap: its right edge at 644, its centre 424, the editor's 432.
    expect(placed.shift).toBe(644 - 220 - 432);
  });

  it('takes its own row only once it does not fit between the groups', () => {
    vi.stubGlobal('innerWidth', 864);
    const seen: StripPlacement[] = [];
    render(<Strip width={452} seen={seen} />);
    expect(seen.at(-1)).toEqual({ crowded: true, shift: 0 });
    at(1280);
    expect(seen.at(-1)).toEqual({ crowded: false, shift: 0 });
  });

  // A control joining a side group as the editor opens (the Start Tour button, an account's button) is drawn in
  // the same frame as the strip's answer to it, so the strip never paints a placement it then leaves.
  it('answers a control joining a side group before the frame is drawn', async () => {
    vi.stubGlobal('innerWidth', 864);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    const view = render(<Shown width={440} />);
    expect(view.getByTestId('strip').dataset.crowded).toBe('false');

    actionsWidth = 241;
    document.querySelector('[data-toolbar-actions]')!.append(document.createElement('button'));
    // One microtask: no task has run, so nothing React scheduled for later has been drawn.
    await Promise.resolve();
    expect(view.getByTestId('strip').dataset.crowded).toBe('true');
  });

  // The tiles that fit drop in a commit of their own (useStripTileLimit): the placement follows them in it, never
  // keeping a row it took for the wider strip until a resize reports the narrower one a frame later.
  it('places the strip as drawn in the commit its tiles change', () => {
    vi.stubGlobal('innerWidth', 864);
    const seen: StripPlacement[] = [];
    const view = render(<Strip width={452} seen={seen} />);
    expect(seen.at(-1)!.crowded).toBe(true);
    view.rerender(<Strip width={440} seen={seen} />);
    expect(seen.at(-1)!.crowded).toBe(false);
  });

  it('stays centred where it is off (a phone, whose strip has its own row)', () => {
    vi.stubGlobal('innerWidth', 390);
    const seen: StripPlacement[] = [];
    render(<Strip width={425} enabled={false} seen={seen} />);
    expect(seen.every((p) => !p.crowded && p.shift === 0)).toBe(true);
  });
});
