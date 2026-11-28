// @vitest-environment jsdom

// The Diagram tour's way in (docs/specs/007-editor/editor-tour.md "Where it appears"): the bottom bar's Start Tour button
// offers it on a Diagram tab the person can work on, taken or not; a press there (or the Settings row) starts it, and it
// never starts on its own. Leaving Diagram mid-tour ends it as skipped.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTourOffersForTests, tourOffer } from './tour-offer';
import { requestTourRelaunch } from '@/lib/diagram-tour';
import { setActiveTour } from '@/lib/tour-active';
import { TourHost } from './TourHost';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));
const popover = vi.hoisted(() => ({
  props: null as null | {
    outro?: unknown;
    title?: string;
    onNext: () => void;
  },
}));
vi.mock('./TourPopover', () => ({
  TourPopover: (props: NonNullable<typeof popover.props>) => {
    popover.props = props;
    return null;
  },
}));
vi.mock('./tour-dom', () => ({
  findTour: () => null,
  waitForSelector: async () => null,
  waitForTour: async () => null,
}));
const ctx = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/app/document/[id]/EditorContext', () => ({
  useEditorContext: () => ctx.current,
  useOptionalEditorContext: () => ctx.current,
}));

const editor = (over: Record<string, unknown> = {}) => {
  ctx.current = {
    hydrated: true,
    anyWelcomeOpen: false,
    isReadOnly: false,
    embedMode: false,
    esBoard: false,
    editorMode: { mode: 'diagram' },
    activeTab: { id: 'tab1', locked: false },
    userPreferences: { tourSeen: false },
    closeContextMenu: vi.fn(),
    tourSquare: { place: vi.fn(), replace: vi.fn(), remove: tourSquareRemove },
    setSelectedId,
    setUserPreferences: vi.fn(),
    writeUserPreferences,
    selfParticipant: { id: 'me' },
    ...over,
  };
};
const writeUserPreferences = vi.fn();
const tourSquareRemove = vi.fn((): string[] => []);
const setSelectedId = vi.fn();
const started = () =>
  track.mock.calls.some((c) => c[0] === 'UI' && c[1] === 'Started' && c[2] === 'Tour');

// The stage loads on demand the first time the tour starts; loaded here once, so a test that starts the tour under
// fake timers draws it as the page does once its chunk has arrived.
beforeAll(async () => {
  await import('./TourStage');
});

beforeEach(() => {
  vi.useFakeTimers();
  track.mockReset();
  popover.props = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setActiveTour('workshop', false);
  resetTourOffersForTests();
});

describe('TourHost offer', () => {
  it('offers the Diagram tour on the Start Tour button once the editor is ready', () => {
    editor();
    render(<TourHost />);
    expect(tourOffer()?.name).toBe('Structured');
  });

  it('never starts on its own', () => {
    editor();
    render(<TourHost />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(started()).toBe(false);
    expect(popover.props).toBeNull();
  });

  it('starts when the button is pressed', () => {
    editor();
    render(<TourHost />);
    act(() => tourOffer()!.start());
    expect(started()).toBe(true);
  });

  it('stays on offer once the tour has been taken, so it can be taken again', () => {
    editor({ userPreferences: { tourSeen: true } });
    render(<TourHost />);
    expect(tourOffer()?.name).toBe('Structured');
  });

  it.each([
    ['before the editor is ready', { hydrated: false }],
    ['to a reader', { isReadOnly: true }],
    ['in an embed', { embedMode: true }],
    ['on a Draw tab', { editorMode: { mode: 'draw' } }],
    ['on a Workshop tab', { editorMode: { mode: 'workshop' } }],
    ['on a Pages tab', { editorMode: { mode: 'pages' } }],
    ['on a Plan tab', { editorMode: { mode: 'plan' } }],
  ])('offers nothing %s', (_label, over) => {
    editor(over);
    render(<TourHost />);
    expect(tourOffer()).toBeNull();
  });

  it('starts nothing while another tour is on screen', () => {
    setActiveTour('workshop', true);
    editor();
    render(<TourHost />);
    act(() => tourOffer()!.start());
    expect(started()).toBe(false);
  });
});

describe('TourHost from Settings', () => {
  it('reruns at once on a Diagram tab', () => {
    editor();
    render(<TourHost />);
    act(() => requestTourRelaunch());
    expect(started()).toBe(true);
  });

  it('does not start later off a Diagram tab: the button is there when the person is', () => {
    editor({ editorMode: { mode: 'workshop' } });
    const { rerender } = render(<TourHost />);
    act(() => requestTourRelaunch());
    editor();
    rerender(<TourHost />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(started()).toBe(false);
  });
});

describe('TourHost running', () => {
  const runToOutro = async () => {
    editor();
    render(<TourHost />);
    act(() => tourOffer()!.start());
    // Every anchored step finds no target in this harness and is skipped, so it runs to the last card.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(popover.props!.outro).toBeTruthy();
  };

  it('draws no stage until the tour starts', async () => {
    editor();
    render(<TourHost />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(tourOffer()).not.toBeNull();
    expect(popover.props).toBeNull();
  });

  it('sends the person off to diagram on its last card', async () => {
    await runToOutro();
    expect(popover.props!.title).toBe("You're ready to diagram");
  });

  it('takes away the square it placed, and its selection, when it ends', async () => {
    tourSquareRemove.mockReturnValueOnce(['sq1']);
    await runToOutro();
    act(() => popover.props!.onNext());
    expect(tourSquareRemove).toHaveBeenCalled();
    expect(setSelectedId).toHaveBeenCalledWith(null);
    expect(writeUserPreferences).toHaveBeenCalledWith({ tourSeen: true }, 'me');
    expect(track).toHaveBeenCalledWith('UI', 'Ended', 'TourCompleted');
  });

  it('ends as skipped when the tab leaves Diagram mid-tour', () => {
    editor();
    const { rerender } = render(<TourHost />);
    act(() => tourOffer()!.start());
    expect(track).toHaveBeenCalledWith('UI', 'Started', 'Tour');
    editor({ editorMode: { mode: 'draw' } });
    rerender(<TourHost />);
    expect(track).toHaveBeenCalledWith('UI', 'Ended', 'TourSkipped');
    expect(writeUserPreferences).toHaveBeenCalledWith({ tourSeen: true }, 'me');
  });
});
