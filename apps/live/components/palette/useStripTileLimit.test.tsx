// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect, useRef } from 'react';
import { useStripTileLimit } from './useStripTileLimit';

// docs/specs/007-editor/toolbar-layout.md "Twelve tiles is enough": the strip shows as many tiles as fit, measured.
// Dropping a tile brings in More, which widens the strip's own chrome: the count is refitted in that commit, never a
// frame later when a resize reports it (Chrome counts what a resize callback moves as a layout shift).

const PITCH = 44;
const CHROME = 300;
const MORE = 53;
const ALL = 12;
// The tiles the strip last drew, which its measured boxes report.
let drawn = ALL;

beforeEach(() => {
  drawn = ALL;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.stubGlobal('innerWidth', 1440);
  // The side groups leave the strip 800 between them (each keeps an 8px gap): measured without More, 11.2 tiles fit;
  // eleven with More are 837 wide and do not.
  const group = (attr: string, left: number, width: number) => {
    const el = document.createElement('div');
    el.setAttribute(attr, '');
    el.getBoundingClientRect = () => new DOMRect(left, 12, width, 46);
    document.body.append(el);
  };
  group('data-toolbar-menu', 0, 192);
  group('data-toolbar-actions', 1008, 1440 - 1008);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

// A strip as wide as its chrome, its tiles and, once a tile is dropped, More.
function Strip({ seen }: { seen: number[] }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { limit, refit } = useStripTileLimit(cardRef, { fallback: ALL, isMobile: false, scale: 1 });
  const tiles = Math.min(ALL, Math.floor(limit));
  const more = tiles < ALL;
  seen.push(tiles);
  useLayoutEffect(() => {
    drawn = tiles;
    refit();
  }, [tiles, more, refit]);
  return (
    <div
      ref={(el) => {
        cardRef.current = el;
        if (el)
          el.getBoundingClientRect = () =>
            new DOMRect(0, 12, CHROME + drawn * PITCH + (drawn < ALL ? MORE : 0), 46);
      }}
    >
      <div
        data-strip-rail=""
        ref={(el) => {
          if (el) el.getBoundingClientRect = () => new DOMRect(0, 12, drawn * PITCH, 46);
        }}
      >
        {Array.from({ length: tiles }, (_, i) => (
          <span
            key={i}
            data-rail-key={i}
            ref={(el) => {
              if (el) el.getBoundingClientRect = () => new DOMRect(0, 12, PITCH, 46);
            }}
          />
        ))}
      </div>
    </div>
  );
}

describe('useStripTileLimit', () => {
  it('refits in the commit a dropped tile brings in More, so the strip it draws fits', () => {
    const seen: number[] = [];
    render(<Strip seen={seen} />);
    const shown = seen.at(-1)!;
    // With More the chrome is 353, so (800 - 353) / 44 = 10.2 tiles: ten, 793 wide with More.
    expect(shown).toBe(10);
    expect(CHROME + shown * PITCH + MORE).toBeLessThanOrEqual(800);
  });
});
