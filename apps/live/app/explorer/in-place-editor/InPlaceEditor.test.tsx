// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => window.location.pathname }));
vi.mock('@/lib/editor-page-loader', () => ({
  loadEditorPage: vi.fn(async () => Editor),
  loadedEditorPage: () => Editor,
}));
const standby = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock('@/app/explorer/new-document/start-new-document', () => ({
  prefetchNewDocumentOpenWhenIdle: () => () => {},
  prepareStandbyDocument: standby.prepare,
}));
const settled = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/new-document/pending-documents', () => ({
  isPendingSettled: () => settled.value,
}));

const mounts = vi.hoisted(() => ({ count: 0 }));
function Editor() {
  const [mount] = useState(() => ++mounts.count);
  return (
    <div data-testid="editor" data-mount={mount}>
      editor at {window.location.pathname}
    </div>
  );
}

import { InPlaceEditor, IN_PLACE_SETTLE_POLL_MS, STANDBY_IDLE_TIMEOUT_MS } from './InPlaceEditor';
import { closeInPlace, openInPlace, setStandbyInPlace } from './in-place-editor-store';
import {
  EXPLORER_SETTLE_TIMEOUT_MS,
  markExplorerSettled,
  resetExplorerSettledForTests,
} from '../explorer-settled';

const ID = 'd0c0ffee-0000-4000-8000-0000000000bb';

function mount() {
  return render(
    <InPlaceEditor>
      <div data-testid="explorer">explorer</div>
    </InPlaceEditor>,
  );
}

const editorShown = () => {
  const editor = screen.queryByTestId('editor');
  return editor !== null && (editor.parentElement as HTMLElement).style.display !== 'none';
};

// Hidden by an ancestor's display, as the Activity and the kept editor hide it.
const hiddenByStyle = (el: HTMLElement | null): boolean => {
  for (let e = el; e; e = e.parentElement) if (e.style.display === 'none') return true;
  return false;
};

const goBack = () =>
  act(() => {
    window.history.replaceState(null, '', '/explorer/home');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

beforeEach(() => {
  vi.useFakeTimers();
  resetExplorerSettledForTests();
  settled.value = false;
  setStandbyInPlace(null);
  mounts.count = 0;
  // A Forward in an earlier test may reopen its document once its editor code resolves.
  closeInPlace(ID);
  window.history.replaceState(null, '', '/explorer/home');
});
afterEach(() => {
  act(() => closeInPlace(ID));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('InPlaceEditor', () => {
  it('shows the Explorer until a document opens in its place', () => {
    mount();
    expect(screen.getByTestId('explorer')).toBeTruthy();
    expect(screen.queryByTestId('editor')).toBeNull();
  });

  it('shows the editor in the Explorer’s place at the document’s address', () => {
    mount();
    act(() => {
      window.history.pushState(null, '', `/document/${ID}`);
      openInPlace(ID);
    });
    expect(editorShown()).toBe(true);
    expect(screen.queryByTestId('explorer')).toBeNull();
  });

  it('returns to the Explorer on Back, keeping the editor hidden until its document is settled', () => {
    mount();
    act(() => {
      window.history.pushState(null, '', `/document/${ID}`);
      openInPlace(ID);
    });
    goBack();
    expect(screen.getByTestId('explorer')).toBeTruthy();
    expect(screen.queryByTestId('editor')).not.toBeNull();
    expect(editorShown()).toBe(false);

    settled.value = true;
    act(() => {
      vi.advanceTimersByTime(IN_PLACE_SETTLE_POLL_MS);
    });
    expect(screen.queryByTestId('editor')).toBeNull();
  });

  it('lets a settled editor go at once on Back', () => {
    settled.value = true;
    mount();
    act(() => {
      window.history.pushState(null, '', `/document/${ID}`);
      openInPlace(ID);
    });
    goBack();
    expect(screen.queryByTestId('editor')).toBeNull();
  });

  it('shows the kept editor again on Forward', () => {
    mount();
    act(() => {
      window.history.pushState(null, '', `/document/${ID}`);
      openInPlace(ID);
    });
    goBack();
    act(() => {
      window.history.replaceState(null, '', `/document/${ID}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(editorShown()).toBe(true);
  });

  it('renders the standby ahead, hidden, and reveals that same editor when it is opened', () => {
    mount();
    act(() => setStandbyInPlace(ID));
    const ahead = screen.getByTestId('editor');
    expect(hiddenByStyle(ahead)).toBe(true);
    expect(screen.getByTestId('explorer')).toBeTruthy();
    act(() => {
      window.history.pushState(null, '', `/document/${ID}`);
      openInPlace(ID);
    });
    expect(editorShown()).toBe(true);
    expect(screen.getByTestId('editor').dataset.mount).toBe('1');
  });

  it('asks for a standby once the Explorer’s documents are listed and it is idle', () => {
    vi.stubGlobal('requestIdleCallback', (run: () => void) => window.setTimeout(run, 50));
    vi.stubGlobal('cancelIdleCallback', (id: number) => window.clearTimeout(id));
    mount();
    act(() => {
      vi.advanceTimersByTime(STANDBY_IDLE_TIMEOUT_MS);
    });
    // Idle, but the Explorer's own reads are still out: nothing is fetched ahead of them.
    expect(standby.prepare).not.toHaveBeenCalled();

    act(() => {
      markExplorerSettled();
      vi.advanceTimersByTime(STANDBY_IDLE_TIMEOUT_MS);
    });
    expect(standby.prepare).toHaveBeenCalledWith('diagram');
  });

  it('asks for a standby anyway when the Explorer’s reads never land', () => {
    vi.stubGlobal('requestIdleCallback', (run: () => void) => window.setTimeout(run, 50));
    vi.stubGlobal('cancelIdleCallback', (id: number) => window.clearTimeout(id));
    mount();
    act(() => {
      vi.advanceTimersByTime(EXPLORER_SETTLE_TIMEOUT_MS + STANDBY_IDLE_TIMEOUT_MS);
    });
    expect(standby.prepare).toHaveBeenCalledWith('diagram');
  });
});
