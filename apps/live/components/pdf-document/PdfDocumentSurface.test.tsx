// @vitest-environment jsdom
// docs/specs/035-pdf-documents/opening.md "Refusals", "Keyboard and accessibility"; editing-modes.md "Share roles";
// reading-surface.md "The toolbar", "Share roles"; keyboard-shortcuts.md "Tools": what the surface shows for each
// state of an open, and which tools each role is offered; live-editing-and-storage.md "Limits": what it says once a
// change the room refused was dropped.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import { PageName, PdfLiveChanges } from '@livedoc/pdf-documents';
import type { PdfDocumentRefusal } from '@/lib/pdf-document/pdf-document-bus';
import type { PdfDocumentOpen } from '@/lib/pdf-document/usePdfDocument';
import { PdfDocumentSurface } from './PdfDocumentSurface';

const open = vi.hoisted(() => ({ now: { phase: 'opening' } as unknown, attempts: [] as number[] }));
vi.mock('@/lib/pdf-document/usePdfDocument', () => ({
  usePdfDocument: (_scope: unknown, _bind: unknown, attempt: number) => {
    open.attempts.push(attempt);
    return open.now;
  },
}));
const dropped = vi.hoisted(() => ({
  listeners: new Set<(refusal: PdfDocumentRefusal) => void>(),
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const KEY = 'ab'.repeat(32) as BlobKey;
const scope = { ownerId: 'ada', documentId: 'D', tabId: 't1', shareCode: null };

function ready(): PdfDocumentOpen {
  return {
    phase: 'ready',
    pages: [
      { name: PageName.ofObject(3), width: 612, height: 792, rotation: 0, label: null },
      { name: PageName.ofObject(5), width: 612, height: 792, rotation: 0, label: null },
    ],
    storedFile: KEY,
    bytes: 1_250_000,
    engine: {} as never,
    drawer: { draw: async () => null, forget: () => {} },
    binding: {
      doc: PdfLiveChanges.load(),
      close: () => {},
      discard: async () => {},
      saveStatus: null,
      onRefused: () => () => {},
    },
    onDropped: (listener) => {
      dropped.listeners.add(listener);
      return () => dropped.listeners.delete(listener);
    },
  };
}

function show(now: PdfDocumentOpen, role: 'edit' | 'participate' | 'view' = 'edit') {
  open.now = now;
  return render(
    <PdfDocumentSurface
      scope={scope}
      documentName="Lease"
      level={role}
      canReview={role !== 'view'}
      author="Ada"
      chrome={null}
      sequence={async () => true}
    />,
  );
}

class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  open.attempts.length = 0;
  vi.stubGlobal('ResizeObserver', NoObserver);
  vi.stubGlobal('IntersectionObserver', NoObserver);
});
afterEach(() => vi.unstubAllGlobals());

const surface = (container: HTMLElement) => container.querySelector('[data-pdf-surface]')!;

describe('a PDF document’s surface', () => {
  it('holds a page-shaped placeholder while the PDF opens', () => {
    const { container } = show({ phase: 'opening' });
    expect(surface(container).getAttribute('data-pdf-surface')).toBe('opening');
    expect(screen.getByRole('status').textContent).toBe('Opening this PDF…');
    expect(screen.queryByRole('button', { name: 'Editing mode: Reviewing' })).toBeNull();
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

  it('names the file in its pill, and gives an Editor the Highlight tool with its keys', () => {
    const { container } = show(ready());
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

  it('says so once a change the room refused was dropped, and stops listening when it goes', () => {
    const { unmount } = show(ready());
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
  ] as const)('tells a session at %s why its change was dropped', (role, sentence) => {
    const { unmount } = show(ready(), role);
    act(() => {
      for (const listener of dropped.listeners) listener('level_too_low');
    });
    expect(screen.getByRole('alert').textContent).toBe(sentence);
    unmount();
  });

  // editing-modes.md "Share roles": a Participant does all of Reviewing (F7).
  it('offers a Participant the tools that mark', () => {
    show(ready(), 'participate');
    expect(screen.getByRole('button', { name: 'Highlight' })).toBeTruthy();
  });

  // "A Viewer has the Viewing toolbar": a control above the session's level is not drawn.
  it('draws a Viewer no tool that marks, and takes none in hand by its key', () => {
    const { container } = show(ready(), 'view');
    expect(screen.queryByRole('button', { name: 'Highlight' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    fireEvent.keyDown(surface(container), { key: 'u' });
    expect(surface(container).getAttribute('data-pdf-tool')).toBe('select');
  });
});
