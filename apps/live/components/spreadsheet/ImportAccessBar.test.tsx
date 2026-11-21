// @vitest-environment jsdom

// The Allow Access bar (docs/specs/029-sheets/imports.md "Allow access", "Who may do what", "Telemetry"): Google's
// warning for everyone, the button an Editor's, the event sent before the change is saved, a failure said.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/telemetry';
import { IMPORT_ACCESS_WORDS, ImportAccessBar } from './ImportAccessBar';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

const scope = { documentId: 'd', ownerId: 'o', shareCode: null, tabId: null };

describe('ImportAccessBar', () => {
  it('lets an Editor allow access, telling telemetry first', async () => {
    const order: string[] = [];
    vi.mocked(track).mockImplementation(() => void order.push('track'));
    let done!: () => void;
    const allow = vi.fn(
      () =>
        new Promise<never>((resolve) => {
          order.push('allow');
          done = () => resolve(undefined as never);
        }),
    );
    render(<ImportAccessBar scope={scope} canAllow allow={allow} />);
    expect(screen.getByRole('status').textContent).toContain(IMPORT_ACCESS_WORDS.warning);
    fireEvent.click(screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.allow }));
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Unlocked', 'ImportAccess');
    expect(order).toEqual(['track', 'allow']);
    expect(allow).toHaveBeenCalledWith(scope);
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: IMPORT_ACCESS_WORDS.allowing })
          .disabled,
      ).toBe(true),
    );
    done();
  });

  it('says so when allowing fails', async () => {
    const allow = vi.fn(async () => {
      throw new Error('403');
    });
    render(<ImportAccessBar scope={scope} canAllow allow={allow} />);
    fireEvent.click(screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.allow }));
    expect((await screen.findByRole('alert')).textContent).toBe(IMPORT_ACCESS_WORDS.failed);
    expect(screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.allow })).toBeTruthy();
  });

  it('shows everyone else the warning without the button', () => {
    render(<ImportAccessBar scope={scope} canAllow={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(IMPORT_ACCESS_WORDS.editorsOnly);
  });
});

describe('ImportAccessBar in This Browser', () => {
  it('offers Sync Document, never Allow Access, and runs the document’s own sync', async () => {
    let done!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (done = resolve)));
    render(<ImportAccessBar scope={scope} canAllow offline sync={{ run, ready: true }} />);
    expect(screen.getByText(IMPORT_ACCESS_WORDS.offline)).toBeTruthy();
    expect(screen.queryByRole('button', { name: IMPORT_ACCESS_WORDS.allow })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.sync }));
    const busy = screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.syncing });
    expect(busy.hasAttribute('disabled')).toBe(true);
    fireEvent.click(busy);
    expect(run).toHaveBeenCalledTimes(1);
    done();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(track).not.toHaveBeenCalled();
  });

  it('waits for the reader to be known, and says why a sync failed, leaving it to try again', async () => {
    const run = vi.fn(async () => {
      throw new Error('offline');
    });
    const { rerender } = render(
      <ImportAccessBar scope={scope} canAllow={false} offline sync={{ run, ready: false }} />,
    );
    const button = screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.sync });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();
    rerender(
      <ImportAccessBar scope={scope} canAllow={false} offline sync={{ run, ready: true }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.sync }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not sync this document. Check your connection and try again.',
    );
    expect(screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.sync })).toBeTruthy();
  });

  it('reads the bar alone where no sync is offered', () => {
    render(<ImportAccessBar scope={scope} canAllow offline />);
    expect(screen.getByText(IMPORT_ACCESS_WORDS.offline)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
