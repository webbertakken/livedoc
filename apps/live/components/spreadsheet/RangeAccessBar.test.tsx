// @vitest-environment jsdom

// The connect bar (docs/specs/029-sheets/formulas.md "Connecting two spreadsheets", "Telemetry"): Google's warning for
// everyone, the button an Editor's connecting every waiting source, the event sent before the change is saved, the
// workbook shown at once, a failure said.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/telemetry';
import type { connectSheetSources } from '@/lib/api/sheet-imports';
import { IMPORT_ACCESS_WORDS } from './ImportAccessBar';
import { RANGE_ACCESS_WORDS, RangeAccessBar } from './RangeAccessBar';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

const scope = { documentId: 'd', ownerId: 'o', shareCode: null, tabId: null };
type Answer = Awaited<ReturnType<typeof connectSheetSources>>;

describe('RangeAccessBar', () => {
  it('lets an Editor connect the waiting sources, telling telemetry first', async () => {
    const order: string[] = [];
    vi.mocked(track).mockImplementation(() => void order.push('track'));
    const answer = {
      workbook: { format: 'ods', rangeSources: ['s1'] },
      rev: 2,
    } as unknown as Answer;
    const connect = vi.fn(async () => {
      order.push('connect');
      return answer;
    });
    const onAllowed = vi.fn();
    render(
      <RangeAccessBar
        scope={scope}
        sources={['s1', 's2']}
        canAllow
        connect={connect}
        onAllowed={onAllowed}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(RANGE_ACCESS_WORDS.warning);
    fireEvent.click(screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.allow }));
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Unlocked', 'RangeAccess');
    await waitFor(() => expect(onAllowed).toHaveBeenCalledWith(answer.workbook));
    expect(connect).toHaveBeenCalledWith(scope, ['s1', 's2']);
    expect(order).toEqual(['track', 'connect']);
    expect(screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.allow })).toBeTruthy();
  });

  it('says so when connecting fails, and shows Allowing… meanwhile', async () => {
    let fail!: () => void;
    const connect = vi.fn(
      () => new Promise<Answer>((_, reject) => (fail = () => reject(new Error('403')))),
    );
    render(<RangeAccessBar scope={scope} sources={['s1']} canAllow connect={connect} />);
    fireEvent.click(screen.getByRole('button', { name: IMPORT_ACCESS_WORDS.allow }));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: IMPORT_ACCESS_WORDS.allowing })
        .disabled,
    ).toBe(true);
    fail();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(RANGE_ACCESS_WORDS.failed),
    );
  });

  it('shows everyone else the bar without its button', () => {
    render(<RangeAccessBar scope={scope} sources={['s1']} canAllow={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(IMPORT_ACCESS_WORDS.editorsOnly);
  });
});
