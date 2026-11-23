// @vitest-environment jsdom
// docs/specs/035-pdf-documents/opening.md "Refusals", "Keyboard and accessibility"; editing-modes.md "Share roles";
// reading-surface.md "The toolbar", "Share roles"; keyboard-shortcuts.md "Tools": what the surface shows for each
// state of an open, and which tools each role is offered; live-editing-and-storage.md "Limits": what it says once a
// change the room refused was dropped; "A change carried across a replacement": what it says of changes that could
// not be placed; "Undo": the person's own steps, from the menu's keys and the toolbar; "Presence": the page in view
// and the mode, said for the tab the person is on, and a press on a person going to their page; "Offline and This
// Browser": a PDF kept here is read from this browser, and its stored file is not replaced for the budget.
import type { OfficeChrome } from '@/components/office/office-chrome';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import {
  Mark,
  PageName,
  PageText,
  PdfChange,
  PdfLiveChanges,
  PdfPermissions,
} from '@livedoc/pdf-documents';
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
    version: '1.7',
    protected: false,
    permissions: PdfPermissions.all(),
    liftLimits: async () => false,
    repaired: false,
    engine: {} as never,
    drawer: {
      draw: async () => null,
      forget: () => {},
      drawTile: async () => null,
      forgetTile: () => {},
      drawThumbnail: async () => null,
      forgetThumbnail: () => {},
      firstDrawn: () => new Promise<void>(() => {}),
    },
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
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  // A frame comes at once: the page in view is read on the frame after a scroll.
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => {
    run(0);
    return 0;
  });
}

const scrollerOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-pdf-pages]')!;
/** Where a page's top is scrolled to by Go to: its top at the view's top, the ground over it showing. */
const topOf = (container: HTMLElement, pageNumber: number) =>
  Number.parseFloat(
    container.querySelector<HTMLElement>(`[data-pdf-page="${pageNumber}"]`)!.style.top,
  ) - 24;
/** The pages scrolled to `top`, as a person scrolls them. */
function scrollPagesTo(container: HTMLElement, top: number) {
  const scroller = scrollerOf(container);
  scroller.scrollTop = top;
  act(() => {
    fireEvent.scroll(scroller);
  });
}

beforeEach(() => {
  open.attempts.length = 0;
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
    const region = screen.getByRole('region', { name: "This PDF is damaged and can't be opened." });
    expect(region.textContent).toContain('You can still download the file.');
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  // opening.md "Passwords": the open password is asked on the pages' place, the menus with nothing to act on.
  it('asks for an open password on the pages’ place', () => {
    const unlock = vi.fn(async () => {});
    const { container } = show({ phase: 'locked', storedFile: KEY, tries: 0, unlock });
    expect(surface(container).getAttribute('data-pdf-surface')).toBe('locked');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'open sesame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(unlock).toHaveBeenCalledWith('open sesame');
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mode: Reviewing' })).toBeNull();
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
    // reading-surface.md "The title row": the pill's tooltip names the file's own version, its pages and its size.
    expect(screen.getByLabelText('PDF 1.7, 2 pages, 1.3 MB').textContent).toBe('PDF');
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
    // The step's page is shown again: page two of this file, out of view until then.
    expect(scrollerOf(container).scrollTop).toBeCloseTo(topOf(container, 2), 1);
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

    // opening.md "Passwords": a file that forbids changes is drawn for Viewing, its notice saying so, until its
    // permissions password lifts the limits; then the level decides as for any PDF.
    it('draws a file that forbids changes for Viewing, with its notice, until its limits are lifted', async () => {
      const now = await ready();
      const forbidding = {
        ...now,
        permissions: {
          ...PdfPermissions.all(),
          changeContent: false,
          mark: false,
          fill: false,
          organise: false,
        },
      };
      const before = show(forbidding, 'edit');
      expect(screen.getByRole('button', { name: 'Mode: Viewing' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Highlight' })).toBeNull();
      expect(screen.getByText('This PDF asks not to be changed.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Enter permissions password' })).toBeTruthy();
      before.unmount();
      show({ ...forbidding, permissions: PdfPermissions.all() }, 'edit');
      expect(screen.getByRole('button', { name: 'Mode: Reviewing' })).toBeTruthy();
      expect(screen.queryByText('This PDF asks not to be changed.')).toBeNull();
    });

    // opening.md "Damaged files": the repaired notice says how changes are saved while the mode can change the PDF.
    it('says a repaired PDF is saved as a repaired copy in Reviewing, and not in Viewing', async () => {
      show({ ...(await ready()), repaired: true }, 'edit');
      expect(screen.getByText(/This PDF was damaged/).textContent).toContain('saved as a repaired copy');
      fireEvent.click(screen.getByRole('button', { name: 'Mode: Reviewing' }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: /Viewing/ }));
      expect(screen.getByText(/This PDF was damaged/).textContent).not.toContain('repaired copy');
    });

    it('takes the tools that mark away in Viewing, and hands them back in Reviewing', async () => {
      show(await ready(), 'edit');
      fireEvent.click(screen.getByRole('button', { name: 'Mode: Reviewing' }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: /Viewing/ }));
      expect(screen.getByRole('button', { name: 'Mode: Viewing' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Highlight' })).toBeNull();
      // "The toolbar": the rest are the mode's own, drawn dimmed until their phases land.
      expect(
        screen
          .getByRole('button', { name: 'Page display: Continuous' })
          .getAttribute('aria-disabled'),
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Rotate view' }).getAttribute('aria-disabled'),
      ).toBeNull();
      expect(screen.getByRole('button', { name: 'Dark pages' }).getAttribute('aria-disabled')).toBe(
        'true',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Mode: Viewing' }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: /Reviewing/ }));
      expect(screen.getByRole('button', { name: 'Highlight' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Page display/ })).toBeNull();
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

    // reading-surface.md "The page bar": the page in view is the one under the middle of the view.
    it('follows the page under the middle of the view, and the nearer one between two pages', async () => {
      laidOut();
      const { container } = show(await ready());
      const second = topOf(container, 2) + 24;
      // The middle of the view, 300 down it, on page two.
      scrollPagesTo(container, second);
      expect(getLocalPdfPresence()?.page).toBe('p:5');
      // The middle 4 pixels under page one, 12 over page two.
      scrollPagesTo(container, second - 16 + 4 - 300);
      expect(getLocalPdfPresence()?.page).toBe('p:3');
      scrollPagesTo(container, second - 4 - 300);
      expect(getLocalPdfPresence()?.page).toBe('p:5');
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
      const { container } = show(await ready(), 'view');
      syncPdfPresencePeople([BOB]);
      receivePdfPresence('b', { tabId: 't1', page: 'p:5', mode: 'reviewing', held: null });
      expect(titleRow.handed?.tabId).toBe('t1');
      let found = false;
      act(() => {
        found = titleRow.handed!.onFollow!('b');
      });
      expect(found).toBe(true);
      expect(scrollerOf(container).scrollTop).toBeCloseTo(topOf(container, 2), 1);
      expect(track).toHaveBeenCalledWith('UI', 'Used', 'PdfDocumentFollow');
    });

    it('goes nowhere for a person on a page this file does not hold, on another tab, or unknown', async () => {
      laidOut();
      const { container } = show(await ready());
      syncPdfPresencePeople([BOB, { id: 'c', name: 'Cy', color: '#00f' }]);
      receivePdfPresence('b', { tabId: 't1', page: 'p:99', mode: 'reviewing', held: null });
      receivePdfPresence('c', { tabId: 't2', page: 'p:5', mode: 'reviewing', held: null });
      for (const id of ['b', 'c', 'nobody']) expect(titleRow.handed!.onFollow!(id)).toBe(false);
      expect(scrollerOf(container).scrollTop).toBe(0);
      expect(track).not.toHaveBeenCalledWith('UI', 'Used', 'PdfDocumentFollow');
    });
  });
});

// reading-surface.md "The left panel", "Thumbnails"; keyboard-shortcuts.md "Panels".
describe('a PDF document’s left panel', () => {
  afterEach(() => localStorage.clear());

  const rail = () => screen.getByRole('toolbar', { name: 'Panels' });
  const thumbnailsButton = () => within(rail()).getByRole('button', { name: 'Thumbnails' });

  it('opens Thumbnails from its rail, for a Viewer too, and closes it from there again', async () => {
    show(await ready(), 'view');
    expect(thumbnailsButton().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(thumbnailsButton());
    const panel = screen.getByRole('complementary', { name: 'Thumbnails' });
    expect(within(panel).getAllByRole('button', { name: /^Page \d$/ }).length).toBe(2);
    expect(thumbnailsButton().getAttribute('aria-pressed')).toBe('true');
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'PdfDocumentPanelThumbnails');
    fireEvent.click(thumbnailsButton());
    expect(screen.queryByRole('complementary', { name: 'Thumbnails' })).toBeNull();
  });

  it('opens where this browser left it, in the next PDF', async () => {
    const first = show(await ready());
    fireEvent.click(thumbnailsButton());
    first.unmount();
    show(await ready());
    expect(screen.getByRole('complementary', { name: 'Thumbnails' })).toBeTruthy();
  });

  it('goes to a page when its thumbnail is pressed', async () => {
    laidOut();
    const { container } = show(await ready(), 'view');
    fireEvent.click(thumbnailsButton());
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(scrollerOf(container).scrollTop).toBeCloseTo(topOf(container, 2), 1);
  });

  it('opens Thumbnails by its key and puts focus on the page in view, then focus back in the panel open', async () => {
    const { container } = show(await ready());
    const key = { key: 'T', code: 'KeyT', ctrlKey: true, altKey: true, shiftKey: true };
    fireEvent.keyDown(surface(container), key);
    const current = screen.getByRole('button', { name: 'Page 1' });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(document.activeElement).toBe(current);
    act(() => scrollerOf(container).focus());
    fireEvent.keyDown(surface(container), key);
    expect(document.activeElement).toBe(current);
  });

  it('gives the pages the keys back when the panel is closed with Escape', async () => {
    const { container } = show(await ready());
    fireEvent.click(thumbnailsButton());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Page 1' }), { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Thumbnails' })).toBeNull();
    expect(document.activeElement).toBe(scrollerOf(container));
  });
});

// reading-surface.md "Outline", "Following a link".
describe('a PDF document’s outline', () => {
  afterEach(() => localStorage.clear());

  const withOutline = async () => {
    const now = await ready();
    const outline = {
      items: [
        {
          title: 'Second page',
          depth: 0,
          target: { kind: 'place' as const, page: PageName.ofObject(5), x: null, y: null },
        },
        {
          title: 'Website',
          depth: 0,
          target: { kind: 'address' as const, address: 'https://example.com/' },
        },
      ],
      cut: false,
    };
    return { ...now, engine: { outline: async () => outline } as never };
  };

  it('opens from the rail, goes to a bookmark’s page, and asks before an address', async () => {
    laidOut();
    const now = await withOutline();
    const { container } = show(now, 'view');
    const rail = screen.getByRole('toolbar', { name: 'Panels' });
    await act(async () => {
      fireEvent.click(within(rail).getByRole('button', { name: 'Outline' }));
    });
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'PdfDocumentPanelOutline');
    fireEvent.click(screen.getByRole('treeitem', { name: 'Second page' }));
    expect(scrollerOf(container).scrollTop).toBeCloseTo(topOf(container, 2), 1);
    // "Previous view": the bookmark was a jump; ⌥← goes back to where the view was, ⌥→ forward again.
    const pages = container.querySelector<HTMLElement>('[data-pdf-pages]')!;
    fireEvent.keyDown(pages, { key: 'ArrowLeft', altKey: true });
    expect(scrollerOf(container).scrollTop).toBe(0);
    fireEvent.keyDown(pages, { key: 'ArrowRight', altKey: true });
    expect(scrollerOf(container).scrollTop).toBeCloseTo(topOf(container, 2), 1);
    // With nowhere further to go, the key is left to the browser.
    expect(fireEvent.keyDown(pages, { key: 'ArrowRight', altKey: true })).toBe(true);
    fireEvent.click(screen.getByRole('treeitem', { name: 'Website' }));
    expect(screen.getByRole('dialog', { name: 'Link' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Link' })).toBeNull();
  });
});

// reading-surface.md "Embedded files".
describe('a PDF document’s embedded files', () => {
  afterEach(() => localStorage.clear());

  it('opens from the rail and saves a file the PDF carries, for a Viewer too', async () => {
    const now = await ready();
    const notes = new TextEncoder().encode('hello');
    const engine = {
      embeddedFiles: async () => ({
        files: [{ name: 'notes.txt', size: 5, type: 'text/plain', description: '', runs: false }],
        cut: false,
      }),
      embeddedFile: async () => ({ ok: true as const, bytes: notes }),
    };
    show({ ...now, engine: engine as never }, 'view');
    const rail = screen.getByRole('toolbar', { name: 'Panels' });
    await act(async () => {
      fireEvent.click(within(rail).getByRole('button', { name: 'Embedded files' }));
    });
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'PdfDocumentPanelEmbeddedFiles');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save notes.txt' }));
    });
    expect(vi.mocked(downloadBlob).mock.calls.at(-1)![1]).toBe('notes.txt');
  });
});

// reading-surface.md "Layers".
describe('a PDF document’s layers', () => {
  afterEach(() => localStorage.clear());

  it('opens from the rail and hides a layer for this person, for a Viewer too', async () => {
    const now = await ready();
    const layerView = vi.fn(async () => true);
    const engine = {
      layers: async () => [{ id: 'o:4', name: 'Plan', visible: true, locked: false }],
      layerView,
    };
    show({ ...now, engine: engine as never }, 'view');
    const rail = screen.getByRole('toolbar', { name: 'Panels' });
    await act(async () => {
      fireEvent.click(within(rail).getByRole('button', { name: 'Layers' }));
    });
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'PdfDocumentPanelLayers');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    });
    expect(layerView).toHaveBeenCalledWith(['o:4']);
    expect(track).toHaveBeenCalledWith('Pdf', 'Toggled', 'Layer.Hidden');
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-pressed')).toBe('false');
  });
});

// reading-surface.md "The pages": Selecting text, Copy; keyboard-shortcuts.md "Selections, marks and comments".
describe('a PDF document’s text', () => {
  const HELLO = PageText.of(
    [...'Hello'].map((c) => c.codePointAt(0)!),
    [...Array.from({ length: 5 }, (_, at) => [72 + at * 6, 700, 78 + at * 6, 708]).flat()],
  );
  const withText = async (copy = true) => {
    const now = await ready();
    return {
      ...now,
      permissions: { ...PdfPermissions.all(), copy },
      engine: { pageText: async () => HELLO } as never,
    };
  };
  const pagesOf = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-pdf-pages]')!;
  const writeText = vi.fn(async (_text: string) => {});
  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });
  // ⌘C on an element, and what it wrote to the clipboard.
  const copyOn = async (element: HTMLElement) => {
    await act(async () => {
      fireEvent.keyDown(element, { key: 'c', ctrlKey: true });
    });
    return writeText.mock.calls.at(-1)?.[0] ?? null;
  };

  it('selects the page in view’s text by its key, copies it, and clears it with Escape', async () => {
    const { container } = show(await withText(), 'view');
    const pages = pagesOf(container);
    await act(async () => {
      fireEvent.keyDown(pages, { key: 'a', ctrlKey: true });
    });
    expect(await copyOn(pages)).toBe('Hello');
    expect(track).toHaveBeenCalledWith('Pdf', 'Copied', 'Text');
    writeText.mockClear();
    fireEvent.keyDown(pages, { key: 'Escape' });
    expect(await copyOn(pages)).toBeNull();
  });

  it('binds Copy and Select all in Edit, Copy dimmed with the reason where the file asks', async () => {
    show(await withText(false), 'view');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(
      screen.getByRole('menuitem', { name: /Select all/ }).getAttribute('aria-disabled'),
    ).not.toBe('true');
    const copy = screen.getByRole('menuitem', { name: /Copy \(this PDF asks not to be copied\)/ });
    expect(copy.getAttribute('aria-disabled')).toBe('true');
  });

  it('says the file asks not to be copied on its key', async () => {
    const { container } = show(await withText(false), 'view');
    const pages = pagesOf(container);
    await act(async () => {
      fireEvent.keyDown(pages, { key: 'a', metaKey: true });
    });
    expect(await copyOn(pages)).toBeNull();
    expect(screen.getByText('This PDF asks not to be copied.')).toBeTruthy();
  });

  it('leaves ⌘A off the pages to the browser', async () => {
    const { container } = show(await withText(), 'view');
    const pages = pagesOf(container);
    await act(async () => {
      fireEvent.keyDown(container.firstElementChild!, { key: 'a', ctrlKey: true });
    });
    expect(await copyOn(pages)).toBeNull();
  });

  it('leaves ⌘C in a field to the field', async () => {
    const { container } = show(await withText(), 'view');
    await act(async () => {
      fireEvent.keyDown(pagesOf(container), { key: 'a', ctrlKey: true });
    });
    expect(await copyOn(screen.getByRole('textbox', { name: 'Page' }))).toBeNull();
  });
});

// reading-surface.md "Find": ⌘F opens the field on the pages, a query is found and listed, Escape gives the pages the
// keys back.
describe('a PDF document’s find', () => {
  afterEach(() => localStorage.clear());

  it('opens by its key, finds a query and lists it, and closes with Escape', async () => {
    const now = await ready();
    const text = PageText.of(
      [...'a fox'].map((c) => c.codePointAt(0)!),
      [...Array.from({ length: 5 }, (_, at) => [at * 6, 400, at * 6 + 6, 408]).flat()],
    );
    const engine = {
      pageText: async () => text,
      fileMarks: async () => [],
      outline: async () => ({ items: [], cut: false }),
      pageMatrix: async () => null,
    };
    const { container } = show({ ...now, engine: engine as never }, 'view');
    const pages = container.querySelector<HTMLElement>('[data-pdf-pages]')!;
    fireEvent.keyDown(pages, { key: 'f', code: 'KeyF', ctrlKey: true });
    const field = screen.getByRole('searchbox', { name: 'Find' });
    fireEvent.change(field, { target: { value: 'fox' } });
    const search = screen.getByRole('search', { name: 'Find in this PDF' });
    await waitFor(() => expect(within(search).getByRole('status').textContent).toBe('1 of 2'));
    expect(track).toHaveBeenCalledWith('Pdf', 'Searched', 'Find');
    fireEvent.click(screen.getByRole('button', { name: 'All results' }));
    expect(screen.getByRole('complementary', { name: 'Find results' })).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('search', { name: 'Find in this PDF' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Find results' })).toBeNull();
  });
});

// reading-surface.md "The pages": The context menu: a right-click on the pages opens the shell's menu, which acts on
// the selected text.
describe('a PDF document’s context menu', () => {
  afterEach(() => localStorage.clear());

  it('opens on a right-click on the pages, and finds the selected text', async () => {
    const now = await ready();
    const text = PageText.of(
      [...'fox'].map((c) => c.codePointAt(0)!),
      [...Array.from({ length: 3 }, (_, at) => [at * 6, 400, at * 6 + 6, 408]).flat()],
    );
    const engine = {
      pageText: async () => text,
      fileMarks: async () => [],
      outline: async () => ({ items: [], cut: false }),
      pageMatrix: async () => null,
    };
    const { container } = show({ ...now, engine: engine as never }, 'view');
    const pages = container.querySelector<HTMLElement>('[data-pdf-pages]')!;
    await act(async () => {
      fireEvent.keyDown(pages, { key: 'a', ctrlKey: true });
    });
    fireEvent.contextMenu(pages, { clientX: 100, clientY: 100 });
    const menu = screen.getByRole('menu', { name: 'Context menu' });
    expect(within(menu).getByRole('menuitem', { name: /^Copy/ })).toBeTruthy();
    // A Viewer is offered no Highlight.
    expect(within(menu).queryByRole('menuitem', { name: /^Highlight/ })).toBeNull();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Find “fox”/ }));
    expect(screen.getByRole<HTMLInputElement>('searchbox', { name: 'Find' }).value).toBe('fox');
  });
});
