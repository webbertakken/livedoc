// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewportStoreProvider } from '@/hooks/canvas/useViewportStore';
import { VIEWPORT_EDGE_MARGIN } from '@/lib/clamp-to-viewport';
import { createViewportStore } from '@/lib/viewport-store';
import { NoteCallout, NOTE_CALLOUT_WIDTH_PX } from './NoteCallout';

// Where the box under a note stands in the window (docs/specs/021-event-storming/board-structure.md "Hotspot
// answers"). jsdom lays nothing out, so the box's place on the page is this file's to say: where it would stand
// unmoved, plus whatever it has been moved by.

const ANCHOR = { x: 0, y: 0, width: 140, height: 140 };
const HEIGHT = 136.625;

// Where the box would stand unmoved, window px.
let place = { left: 0, top: 0 };
// How much shorter every second look finds the box: a box on the board is measured through the board's scale, and
// two looks at the same box come back a fraction of a pixel apart.
let wobble = 0;
let looks = 0;

const callout = () => document.querySelector<HTMLElement>('[data-note-callout]')!;
const movedBy = (node: HTMLElement) => {
  // A move along one axis is read back as `translate(x)`.
  const found = /translate\(([-+.\de]+)px(?:, ([-+.\de]+)px)?\)/.exec(node.style.transform);
  return found ? { x: Number(found[1]), y: Number(found[2] ?? 0) } : { x: 0, y: 0 };
};

beforeEach(() => {
  place = { left: 0, top: 0 };
  wobble = 0;
  looks = 0;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (!this.hasAttribute('data-note-callout')) return new DOMRect();
    looks += 1;
    const moved = movedBy(this);
    const height = looks % 2 === 0 ? HEIGHT - wobble : HEIGHT;
    return new DOMRect(place.left + moved.x, place.top + moved.y, NOTE_CALLOUT_WIDTH_PX, height);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const drawn = () => (
  <NoteCallout anchor={ANCHOR}>
    <p>Remake it.</p>
  </NoteCallout>
);

describe('NoteCallout', () => {
  it('stands where its note puts it while it fits the window', () => {
    place = { left: 300, top: 200 };

    render(drawn());

    expect(movedBy(callout())).toEqual({ x: 0, y: 0 });
  });

  it('is moved back inside the window, a margin from its edges, when its note stands at one', () => {
    place = { left: window.innerWidth - 100, top: window.innerHeight - 50 };

    render(drawn());

    expect(movedBy(callout())).toEqual({
      x: window.innerWidth - VIEWPORT_EDGE_MARGIN - (place.left + NOTE_CALLOUT_WIDTH_PX),
      y: window.innerHeight - VIEWPORT_EDGE_MARGIN - (place.top + HEIGHT),
    });
  });

  it('settles when two looks at the same box differ by a fraction of a pixel', () => {
    place = { left: window.innerWidth - 100, top: window.innerHeight - 50 };
    wobble = 0.0001220703125;

    const { rerender } = render(drawn());
    const first = movedBy(callout());
    rerender(drawn());
    rerender(drawn());

    expect(movedBy(callout())).toEqual(first);
    // A look a render, never a look answering the last one.
    expect(looks).toBeLessThanOrEqual(6);
  });

  it('is measured again when the board is panned, and stands under its note once it fits', () => {
    const store = createViewportStore(1);
    place = { left: window.innerWidth + 400, top: 200 };
    render(<ViewportStoreProvider store={store}>{drawn()}</ViewportStoreProvider>);
    expect(movedBy(callout()).x).toBeLessThan(0);

    // The pan brings the note, and the box under it, well inside the window.
    place = { left: 300, top: 200 };
    act(() => store.setOffset({ x: -700, y: 0 }));

    expect(movedBy(callout())).toEqual({ x: 0, y: 0 });
  });
});
