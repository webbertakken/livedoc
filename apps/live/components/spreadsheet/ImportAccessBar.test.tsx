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
