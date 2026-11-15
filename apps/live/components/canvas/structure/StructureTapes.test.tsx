// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ES_LANE_PITCH,
  PIVOTAL_TAPE_OPACITY,
  PIVOTAL_TAPE_PX,
  type Element,
  type Layer,
} from '@livedoc/document';
import { clearLocalPreview, setLocalPreview } from '@/lib/drag-preview';
import { StructureTapes } from './StructureTapes';

// The tape of a pivotal event on the canvas (docs/specs/021-event-storming/board-structure.md "Pivotal events").

const TAB = 'tab-1';
const event = (id: string, x: number, extra: Record<string, unknown> = {}): Element => ({
  id,
  type: 'sticky',
  x,
  y: 0,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
  ...extra,
});

const tapes = () => [...document.querySelectorAll<HTMLElement>('[data-pivotal-tape]')];

afterEach(() => {
  cleanup();
  clearLocalPreview();
});

describe('StructureTapes', () => {
  it('draws a band through each pivotal event, in canvas units, as decoration', () => {
    render(
      <StructureTapes
        tabId={TAB}
        elements={[event('a', 0, { esPivotal: true }), event('b', 400)]}
      />,
    );
    const [tape, ...rest] = tapes();
    expect(rest).toEqual([]);
    expect(tape!.dataset.pivotalTape).toBe('a');
    expect(tape!.getAttribute('aria-hidden')).toBe('true');
    expect(tape!.style.left).toBe(`${100 - PIVOTAL_TAPE_PX / 2}px`);
    expect(tape!.style.top).toBe(`${-ES_LANE_PITCH / 2}px`);
    expect(tape!.style.width).toBe(`${PIVOTAL_TAPE_PX}px`);
    expect(tape!.style.height).toBe(`${200 + ES_LANE_PITCH}px`);
    expect(tape!.style.opacity).toBe(String(PIVOTAL_TAPE_OPACITY));
    expect(tape!.className).toContain('pointer-events-none');
    // The candidate contexts' line ink, which follows the canvas.
    expect(tape!.style.backgroundColor).toBe('var(--ctx-line)');
    expect(tape!.closest('.lvd-context')).not.toBeNull();
  });

  it('draws nothing on a board without a pivotal event', () => {
    const { container } = render(<StructureTapes tabId={TAB} elements={[event('b', 400)]} />);
    expect(container.innerHTML).toBe('');
  });

  it('follows its event while it is in hand', () => {
    const board = [event('a', 0, { esPivotal: true })];
    render(<StructureTapes tabId={TAB} elements={board} />);
    act(() => setLocalPreview(TAB, [event('a', 300, { esPivotal: true })], board));
    expect(tapes()[0]!.style.left).toBe(`${400 - PIVOTAL_TAPE_PX / 2}px`);
    act(() => clearLocalPreview());
    expect(tapes()[0]!.style.left).toBe(`${100 - PIVOTAL_TAPE_PX / 2}px`);
  });

  it('draws no tape for an event on a hidden layer', () => {
    const layers: Layer[] = [
      { id: 'shown', name: 'Shown' },
      { id: 'off', name: 'Off', visible: false },
    ];
    render(
      <StructureTapes
        tabId={TAB}
        layers={layers}
        elements={[
          event('a', 0, { esPivotal: true, layerId: 'off' }),
          event('b', 400, { esPivotal: true, layerId: 'shown' }),
        ]}
      />,
    );
    expect(tapes().map((t) => t.dataset.pivotalTape)).toEqual(['b']);
  });
});
