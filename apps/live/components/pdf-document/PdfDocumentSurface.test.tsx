// @vitest-environment jsdom
// docs/specs/035-pdf-documents/opening.md "Refusals", "Keyboard and accessibility"; editing-modes.md "Share roles";
// reading-surface.md "The toolbar", "Share roles"; keyboard-shortcuts.md "Tools": what the surface shows for each
// state of an open, and which tools each role is offered; live-editing-and-storage.md "Limits": what it says once a
// change the room refused was dropped; "A change carried across a replacement": what it says of changes that could
// not be placed; "Undo": the person's own steps, from the menu's keys and the toolbar; "Presence": the page in view
// and the mode, said for the tab the person is on, and a press on a person going to their page; "Offline and This
// Browser": a PDF kept here is read from this browser, and its stored file is not replaced for the budget.
import type { OfficeChrome } from '@/components/office/office-chrome';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { Mark, PageName, PdfChange, PdfLiveChanges } from '@livedoc/pdf-documents';
import { downloadBlob } from '@/lib/download-blob';
import { __setThisBrowserBlobs } from '@/lib/offline/offline-blobs';
import { watchPdfBudget } from '@/lib/pdf-document/pdf-budget-replacement';
import type { PdfDocumentRefusal } from '@/lib/pdf-document/pdf-document-bus';
import { unboundPdfLiveChanges } from '@/lib/pdf-document/pdf-live-binding';
import {
  getLocalPdfPresence,
  receivePdfPresence,
  resetPdfPresenceForTests,
  setLocalPdfPresence,
  syncPdfPresencePeople,
} from '@/lib/pdf-document/pdf-presence-store';
import { PDF_LOCAL_ORIGIN, pdfUndo } from '@/lib/pdf-document/pdf-undo';
import type { PdfDocumentOpen } from '@/lib/pdf-document/usePdfDocument';
import { track } from '@/lib/telemetry';
import { PdfDocumentSurface } from './PdfDocumentSurface';

const open = vi.hoisted(() => ({ now: { phase: 'opening' } as unknown, attempts: [] as number[] }));
vi.mock('@/lib/pdf-document/usePdfDocument', () => ({
  usePdfDocument: (_scope: unknown, _bind: unknown, attempt: number) => {
    open.attempts.push(attempt);
    return open.now;
  },
}));
vi.mock('@/lib/download-blob', () => ({ downloadBlob: vi.fn() }));
// Which surface sends a thumbnail is the hook's own test (usePdfThumbnail.test.tsx): here, that the surface asks it.
const thumbnail = vi.hoisted(() => ({ usePdfThumbnail: vi.fn() }));
vi.mock('@/lib/pdf-document/usePdfThumbnail', () => thumbnail);
vi.mock('@/lib/pdf-document/pdf-budget-replacement', async (original) => {
  const actual = await original<typeof import('@/lib/pdf-document/pdf-budget-replacement')>();
  return { ...actual, watchPdfBudget: vi.fn(actual.watchPdfBudget) };
});
const dropped = vi.hoisted(() => ({
  listeners: new Set<(refusal: PdfDocumentRefusal) => void>(),
  lost: new Set<(count: number) => void>(),
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
// The title row as it is, with what the surface hands it kept: a press on a person reaches the surface through it.
const titleRow = vi.hoisted(() => ({
  handed: null as { tabId?: string; onFollow?: (personId: string) => boolean } | null,
}));
vi.mock('@/components/office/OfficeTitleRow', async (original) => {
  const actual = await original<typeof import('@/components/office/OfficeTitleRow')>();
  type Props = Parameters<typeof actual.OfficeTitleRow>[0];
  return {
    ...actual,
    OfficeTitleRow: (props: Props) => {
      titleRow.handed = props;
      return <actual.OfficeTitleRow {...props} />;
    },
  };
});

const KEY = 'ab'.repeat(32) as BlobKey;
const scope = { ownerId: 'ada', documentId: 'D', tabId: 't1', shareCode: null };

async function ready(): Promise<PdfDocumentOpen & { phase: 'ready' }> {
  const binding = await unboundPdfLiveChanges({
    update: PdfLiveChanges.merge([]),
    stateVector: new Uint8Array(),
    storedFile: KEY,
  });
  return {
    phase: 'ready',
    pages: [
      { name: PageName.ofObject(3), width: 612, height: 792, rotation: 0, label: null },
      { name: PageName.ofObject(5), width: 612, height: 792, rotation: 0, label: null },
    ],
    storedFile: KEY,
    bytes: 1_250_000,
    protected: false,
    engine: {} as never,
    drawer: { draw: async () => null, forget: () => {} },
    binding,
    undo: pdfUndo(binding.doc),
    onLost: (listener) => {
      dropped.lost.add(listener);
      return () => dropped.lost.delete(listener);
    },
    onDropped: (listener) => {
      dropped.listeners.add(listener);
      return () => dropped.listeners.delete(listener);
    },
  };
}

function show(
  now: PdfDocumentOpen,
  role: 'edit' | 'participate' | 'view' = 'edit',
  present = true,
  home: 'room' | 'this-browser' = 'room',
  chrome: OfficeChrome | null = null,
) {
  open.now = now;
  return render(
    <PdfDocumentSurface
      scope={scope}
      documentName="Lease"
      level={role}
      canReview={role !== 'view'}
      author="Ada"
      chrome={chrome}
      present={present}
      sequence={async () => true}
      home={home}
    />,
  );
}

/** Observers that can be told what lies within them, kept by the margin each was made with. */
const watching = new Map<string, WatchedObserver>();
class WatchedObserver {
  private readonly tell: IntersectionObserverCallback;
  private readonly watched = new Set<Element>();
  constructor(tell: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.tell = tell;
    watching.set(options?.rootMargin ?? '', this);
  }
  observe(element: Element) {
    this.watched.add(element);
  }
  unobserve(element: Element) {
    this.watched.delete(element);
  }
  disconnect() {}
  /** The pages now within this observer, by their numbers; every other page is outside it. */
  holds(pageNumbers: readonly number[]) {
    const entries = [...this.watched].map((target) => ({
      target,
      isIntersecting: pageNumbers.includes(Number((target as HTMLElement).dataset.pdfPage)),
    }));
    act(() => this.tell(entries as unknown as IntersectionObserverEntry[], this as never));
  }
}
/** The line across the middle of the view (PdfPages' MIDDLE_MARGIN). */
const underTheMiddle = () => watching.get('-50% 0px')!;

class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** A surface with a width, so its pages are laid out. */
class WidthObserver extends NoObserver {
  private readonly report: () => void;
  constructor(report: () => void) {
    super();
    this.report = report;
  }
  override observe() {
    this.report();
  }
}
function laidOut() {
  vi.stubGlobal('ResizeObserver', WidthObserver);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
}

beforeEach(() => {
  open.attempts.length = 0;
  watching.clear();
  titleRow.handed = null;
  resetPdfPresenceForTests();
  vi.stubGlobal('ResizeObserver', NoObserver);
  vi.stubGlobal('IntersectionObserver', NoObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const surface = (container: HTMLElement) => container.querySelector('[data-pdf-surface]')!;

describe('a PDF document’s surface', () => {
  it('holds a page-shaped placeholder while the PDF opens', () => {
    const { container } = show({ phase: 'opening' });
    expect(surface(container).getAttribute('data-pdf-surface')).toBe('opening');
    expect(screen.getByRole('status').textContent).toBe('Opening this PDF…');
    expect(screen.queryByRole('button', { name: 'Mode: Reviewing' })).toBeNull();
  });

  it('shows a refusal as a named region with its sentence, and Download while the file is held', () => {
    const { container } = show({ phase: 'refused', refusal: 'pdf_damaged', storedFile: KEY });
    expect(surface(container).getAttribute('data-pdf-surface')).toBe('refused:pdf_damaged');
    const region = screen.getByRole('region', {
      name: "This PDF is damaged and can't be opened. You can still download the file.",
    });
    expect(region).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  // "Download bakes in this browser from the bytes kept here"
  it('downloads a PDF kept in This Browser from this browser’s own bytes', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 kept here');
    const read = vi.fn(async () => bytes);
    __setThisBrowserBlobs({ read } as never);
    show(
      { phase: 'refused', refusal: 'pdf_damaged', storedFile: KEY },
      'edit',
      true,
      'this-browser',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    });
    expect(read).toHaveBeenCalledWith(KEY);
    expect(vi.mocked(downloadBlob)).toHaveBeenCalledWith(expect.any(Blob), 'Lease.pdf');
    __setThisBrowserBlobs(null);
  });

  // "The stored file is not replaced for the budget here"
  it('watches the budget for a PDF in its room, and never for one in This Browser', async () => {
    vi.mocked(watchPdfBudget).mockClear();
    const here = show(await ready(), 'edit', true, 'this-browser');
    expect(watchPdfBudget).not.toHaveBeenCalled();
    here.unmount();
    show(await ready());
    expect(watchPdfBudget).toHaveBeenCalledTimes(1);
  });

  // live-editing-and-storage.md "A browser's thumbnail"
  it('hands its PDF, its home and its level to what sends the thumbnail', async () => {
    const now = await ready();
    show(now, 'participate', true, 'this-browser');
    expect(thumbnail.usePdfThumbnail).toHaveBeenLastCalledWith(
      now,
      expect.objectContaining({ get: expect.any(Function) }),
      scope,
      'this-browser',
      'participate',
    );
  });

  it('offers no Download where the bytes are not held', () => {
    show({ phase: 'refused', refusal: 'blob_missing', storedFile: null });
    expect(screen.getByRole('region', { name: "This PDF's file is missing from storage." }));
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('reads once more on Try again after reading stopped', () => {
    show({ phase: 'refused', refusal: 'pdf_stopped', storedFile: KEY });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(open.attempts.at(-1)).toBe(1);
  });

  it('says a tab that is gone, and a surface that could not load, with Try Again', () => {
    const gone = show({ phase: 'gone' });
    expect(screen.getByText('This PDF is no longer in this document.')).toBeTruthy();
    gone.unmount();
    show({ phase: 'failed' });
    expect(screen.getByRole('alert').textContent).toContain('This tab couldn’t load.');
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(open.attempts.at(-1)).toBe(1);
  });

  it('names the file in its pill, and gives an Editor the Highlight tool with its keys', async () => {
    const { container } = show(await ready());
    expect(surface(container).getAttribute('data-pdf-surface')).toBe('ready');
    expect(container.querySelector('[data-pdf-pages="2"]')).toBeTruthy();
    expect(screen.getByLabelText('PDF, 2 pages, 1.3 MB').textContent).toBe('PDF');
    const highlight = screen.getByRole('button', { name: 'Highlight' });
    expect(highlight.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(highlight);
    expect(surface(container).getAttribute('data-pdf-tool')).toBe('highlight');
    expect(screen.getByRole('button', { name: 'Highlight' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // Escape returns to Select; U takes the tool in hand again; V returns too. Never with a modifier held.
    fireEvent.keyDown(surface(container), { key: 'Escape' });
    expect(surface(container).getAttribute('data-pdf-tool')).toBe('select');
    fireEvent.keyDown(surface(container), { key: 'u', ctrlKey: true });
    expect(surface(container).getAttribute('data-pdf-tool')).toBe('select');
    fireEvent.keyDown(surface(container), { key: 'U' });
    expect(surface(container).getAttribute('data-pdf-tool')).toBe('highlight');
    fireEvent.keyDown(surface(container), { key: 'v' });
    expect(surface(container).getAttribute('data-pdf-tool')).toBe('select');
  });

  it('says so once a change the room refused was dropped, and stops listening when it goes', async () => {
    const { unmount } = show(await ready());
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      for (const listener of dropped.listeners) listener('state');
    });
    expect(screen.getByRole('alert').textContent).toBe(
      'This PDF has more unsaved changes than fit.',
    );
    unmount();
    expect(dropped.listeners.size).toBe(0);
  });

  // editing-modes.md "Errors": a change refused for the level is dropped with the level's own line.
  it.each([
    ['participate', 'You can review this PDF, but not edit its pages.'],
    ['view', 'You can view this PDF, but not change it.'],
  ] as const)('tells a session at %s why its change was dropped', async (role, sentence) => {
    const { unmount } = show(await ready(), role);
    act(() => {
      for (const listener of dropped.listeners) listener('level_too_low');
    });
    expect(screen.getByRole('alert').textContent).toBe(sentence);
    unmount();
  });

  it.each([
    [1, '1 change couldn’t be placed on the new file.'],
    [3, '3 changes couldn’t be placed on the new file.'],
  ])(
    'says so when %i of a person’s changes could not be placed on a replaced file',
    async (count, sentence) => {
      const { unmount } = show(await ready());
      act(() => {
        for (const listener of dropped.lost) listener(count);
      });
      expect(screen.getByRole('alert').textContent).toBe(sentence);
      unmount();
      expect(dropped.lost.size).toBe(0);
    },
  );

  // live-editing-and-storage.md "Undo": the person's own steps; dimmed where there is none.
  it('takes a person’s step back and makes it again from the toolbar, each dimmed with nothing to do', async () => {
    const now = await ready();
    const mark = Mark.highlight({
      id: 'm',
      page: now.pages[1]!.name,
      quads: [[72, 720, 172, 720, 72, 700, 172, 700]],
      text: 'The quick',
      colour: '#fdf1a9',
      opacity: 1,
      author: 'Ada',
      createdAt: 1_795_000_000_000,
    })!;
    laidOut();
    const { container } = show(now, 'participate');
    const shown = vi.fn();
    Element.prototype.scrollIntoView = shown;
    const button = (name: string) => screen.getByRole('button', { name });
    expect(button('Undo').getAttribute('aria-disabled')).toBe('true');
    expect(button('Redo').getAttribute('aria-disabled')).toBe('true');
    act(() => {
      now.undo.step({ page: mark.page }, () =>
        PdfChange.apply(now.binding.doc, PdfChange.addMark(mark), PDF_LOCAL_ORIGIN),
      );
    });
    expect(button('Undo').getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(button('Undo'));
    expect(PdfLiveChanges.marks(now.binding.doc)).toEqual([]);
    expect(track).toHaveBeenCalledWith('Pdf', 'Undone');
    // The step's page is shown again: page two of this file.
    expect(shown.mock.contexts[0]).toBe(container.querySelector('[data-pdf-page="2"]'));
    expect(button('Undo').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button('Redo'));
    expect(PdfLiveChanges.marks(now.binding.doc)).toEqual([mark]);
    expect(track).toHaveBeenCalledWith('Pdf', 'Redone');
    expect(button('Redo').getAttribute('aria-disabled')).toBe('true');
  });

  it('takes a step back by its key, and makes it again', async () => {
    const now = await ready();
    const { container } = show(now);
    Element.prototype.scrollIntoView = vi.fn();
    act(() => {
      now.undo.step({ page: now.pages[0]!.name }, () =>
        PdfChange.apply(
          now.binding.doc,
          PdfChange.turnPage(now.pages[0]!.name, 90),
          PDF_LOCAL_ORIGIN,
        ),
      );
    });
    fireEvent.keyDown(surface(container), { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(PdfLiveChanges.pageTurns(now.binding.doc).size).toBe(0);
    fireEvent.keyDown(surface(container), {
      key: 'z',
      code: 'KeyZ',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(PdfLiveChanges.pageTurns(now.binding.doc).size).toBe(1);
  });

  // reading-surface.md "The toolbar": Undo and Redo are hidden in Viewing, and from a Viewer.
  it('draws a Viewer no Undo', async () => {
    show(await ready(), 'view');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull();
  });

  // editing-modes.md "Share roles": a Participant does all of Reviewing (F7).
  it('offers a Participant the tools that mark', async () => {
    show(await ready(), 'participate');
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeTruthy();
  });

  // "A Viewer has the Viewing toolbar": a control above the session's level is not drawn.
  it('draws a Viewer no tool that marks, and takes none in hand by its key', async () => {
    const { container } = show(await ready(), 'view');
    expect(screen.queryByRole('button', { name: 'Highlight' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    fireEvent.keyDown(surface(container), { key: 'u' });
    expect(surface(container).getAttribute('data-pdf-tool')).toBe('select');
  });

  // editing-modes.md: a person starts in Reviewing, or the most their level allows; the switch offers what the
  // level allows, Editing dimmed until it is built.
  describe('the mode switch', () => {
    const offered = () => screen.getAllByRole('menuitemradio').map((item) => item.textContent);

    it('starts an Editor in Reviewing, with Editing dimmed and Viewing to choose', async () => {
      show(await ready(), 'edit');
      fireEvent.click(screen.getByRole('button', { name: 'Mode: Reviewing' }));
      expect(offered()).toEqual([
        'ReviewingMark text, comment, fill in and sign',
        'EditingComing soon',
        'ViewingRead or print the PDF',
      ]);
      expect(
        screen.getByRole('menuitemradio', { name: /Editing/ }).getAttribute('aria-disabled'),
      ).toBe('true');
    });

    it('takes the tools that mark away in Viewing, and hands them back in Reviewing', async () => {
      show(await ready(), 'edit');
      fireEvent.click(screen.getByRole('button', { name: 'Mode: Reviewing' }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: /Viewing/ }));
      expect(screen.getByRole('button', { name: 'Mode: Viewing' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Highlight' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Mode: Viewing' }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: /Reviewing/ }));
      expect(screen.getByRole('button', { name: 'Highlight' })).toBeTruthy();
    });

    it('offers a Participant Reviewing and Viewing, never Editing', async () => {
      show(await ready(), 'participate');
      fireEvent.click(screen.getByRole('button', { name: 'Mode: Reviewing' }));
      expect(offered()).toEqual([
        'ReviewingMark text, comment, fill in and sign',
        'ViewingRead or print the PDF',
      ]);
    });

    it('offers a Viewer Viewing alone', async () => {
      show(await ready(), 'view');
      fireEvent.click(screen.getByRole('button', { name: 'Mode: Viewing' }));
      expect(offered()).toEqual(['ViewingRead or print the PDF']);
    });

    // kinds-outside-the-canvas.md "The surface": in the editor's pane the title row holds the document's own parts,
    // the switch among them; the other pane of a split is handed none.
    it('sits among the document’s own parts where the editor hands them', async () => {
      const chrome: OfficeChrome = {
        back: { kind: 'explorer' },
        rename: vi.fn(),
        renameNonce: 0,
        star: { starred: false, onToggle: vi.fn() },
        move: vi.fn(),
        share: { shareable: true, onOpen: vi.fn() },
        makeCopy: null,
        onOpenSettings: vi.fn(),
        onOpenAccount: vi.fn(),
        people: [],
        onOpenTab: vi.fn(),
      };
      show(await ready(), 'edit', true, 'room', chrome);
      expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
      expect(screen.getAllByRole('button', { name: 'Mode: Reviewing' })).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      expect(chrome.share!.onOpen).toHaveBeenCalledTimes(1);
    });
  });

  // live-editing-and-storage.md "Presence".
  describe('presence', () => {
    const BOB = { id: 'b', name: 'Bob', color: '#0f0' };

    it.each([
      ['edit', 'reviewing'],
      ['participate', 'reviewing'],
      ['view', 'viewing'],
    ] as const)('says the page in view and the mode, at the %s level', async (role, mode) => {
      show(await ready(), role);
      expect(getLocalPdfPresence()).toEqual({ tabId: 't1', page: 'p:3', mode, held: null });
    });

    it('follows the page under the middle of the view, and keeps the last one between two pages', async () => {
      laidOut();
      vi.stubGlobal('IntersectionObserver', WatchedObserver);
      show(await ready());
      underTheMiddle().holds([2]);
      expect(getLocalPdfPresence()?.page).toBe('p:5');
      underTheMiddle().holds([]);
      expect(getLocalPdfPresence()?.page).toBe('p:5');
      // Two pages touch the line as one gives way to the next: the earlier one is the page in view.
      underTheMiddle().holds([1, 2]);
      expect(getLocalPdfPresence()?.page).toBe('p:3');
    });

    it('says the mode a person switches to', async () => {
      show(await ready());
      fireEvent.click(screen.getByRole('menuitem', { name: 'View' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Mode' }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: /Viewing/ }));
      expect(getLocalPdfPresence()).toMatchObject({ page: 'p:3', mode: 'viewing' });
    });

    it('says nothing while the PDF opens or is refused', () => {
      show({ phase: 'opening' });
      expect(getLocalPdfPresence()).toBeNull();
    });

    it('takes the place back when the surface goes', async () => {
      const shown = show(await ready());
      shown.unmount();
      expect(getLocalPdfPresence()).toBeNull();
    });

    it('says nothing from the other pane of a split, and leaves the place of the tab the person is on', async () => {
      setLocalPdfPresence('t1', { page: 'p:9', mode: 'editing', held: null });
      const shown = show(await ready(), 'edit', false);
      expect(getLocalPdfPresence()).toMatchObject({ page: 'p:9', mode: 'editing' });
      shown.unmount();
      expect(getLocalPdfPresence()).toMatchObject({ page: 'p:9' });
    });

    it('goes to the page a person is on when they are pressed in the title row', async () => {
      laidOut();
      const scrolled = vi.fn();
      Element.prototype.scrollIntoView = scrolled;
      const { container } = show(await ready(), 'view');
      syncPdfPresencePeople([BOB]);
      receivePdfPresence('b', { tabId: 't1', page: 'p:5', mode: 'reviewing', held: null });
      expect(titleRow.handed?.tabId).toBe('t1');
      let found = false;
      act(() => {
        found = titleRow.handed!.onFollow!('b');
      });
      expect(found).toBe(true);
      expect(scrolled.mock.contexts).toEqual([container.querySelector('[data-pdf-page="2"]')]);
      expect(scrolled).toHaveBeenCalledWith({ block: 'start' });
      expect(track).toHaveBeenCalledWith('UI', 'Used', 'PdfDocumentFollow');
    });

    it('goes nowhere for a person on a page this file does not hold, on another tab, or unknown', async () => {
      laidOut();
      const scrolled = vi.fn();
      Element.prototype.scrollIntoView = scrolled;
      show(await ready());
      syncPdfPresencePeople([BOB, { id: 'c', name: 'Cy', color: '#00f' }]);
      receivePdfPresence('b', { tabId: 't1', page: 'p:99', mode: 'reviewing', held: null });
      receivePdfPresence('c', { tabId: 't2', page: 'p:5', mode: 'reviewing', held: null });
      for (const id of ['b', 'c', 'nobody']) expect(titleRow.handed!.onFollow!(id)).toBe(false);
      expect(scrolled).not.toHaveBeenCalled();
      expect(track).not.toHaveBeenCalledWith('UI', 'Used', 'PdfDocumentFollow');
    });
  });
});
