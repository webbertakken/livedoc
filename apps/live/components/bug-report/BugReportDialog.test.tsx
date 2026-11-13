// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUG_REPORT_LIMITS, type BugReportSubmission } from '@livedoc/api-schema';
import type { BugReportSendResult } from '@/lib/bug-report/send';

// docs/specs/016-platform/bug-reports.md "The form": the fields, What's Attached, the confirmation and every failure.

const sent: BugReportSubmission[] = [];
let answer: BugReportSendResult = { kind: 'filed', number: 7 };
const tracked: unknown[][] = [];
let guestId: string | null = 'guest-1';
let prepared: {
  screenshot: { contentType: 'image/png'; data: string };
  previewUrl: string;
} | null = null;

vi.mock('@/lib/bug-report/send', () => ({
  sendBugReport: vi.fn(async (s: BugReportSubmission) => {
    sent.push(s);
    return answer;
  }),
}));
vi.mock('@/lib/bug-report/screenshot', () => ({
  ACCEPTED_SCREENSHOT_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
  captureScreen: vi.fn(async () => prepared),
  encodeImageFile: vi.fn(async () => prepared),
  restoreScreenshot: vi.fn((screenshot: unknown) => ({ screenshot, previewUrl: 'blob:restored' })),
}));
vi.mock('@/lib/telemetry', () => ({ track: (...args: unknown[]) => tracked.push(args) }));
vi.mock('@/components/providers/deferred-auth', () => ({
  useDeferredAuth: () => ({ authLoaded: true, isSignedIn: false }),
}));
vi.mock('@/lib/local-identity', () => ({
  getGuestSelfId: () => guestId,
  getGuestSelfSig: () => null,
}));

const { BugReportDialog } = await import('./BugReportDialog');
const { setWorkbenchConfinement } = await import('@/lib/api/core');
const { sendBugReport } = await import('@/lib/bug-report/send');

beforeEach(() => {
  sent.length = 0;
  tracked.length = 0;
  answer = { kind: 'filed', number: 7 };
  prepared = null;
  guestId = 'guest-1';
  URL.revokeObjectURL = vi.fn();
  localStorage.clear();
});
afterEach(() => cleanup());

const fillTitle = (text: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: 'What went wrong?' }), {
    target: { value: text },
  });

describe('BugReportDialog', () => {
  it('sends the title, details and context, then confirms the card number', async () => {
    render(<BugReportDialog onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Report a Bug' })).toBeTruthy();
    fillTitle('  Save fails ');
    fireEvent.change(screen.getByRole('textbox', { name: /More details/ }), {
      target: { value: 'Spins' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    await screen.findByText('Logged as report #7.');
    expect(screen.getByText('Thanks for the report')).toBeTruthy();
    expect(sent[0]).toMatchObject({
      title: 'Save fails',
      details: 'Spins',
      context: { route: '/' },
    });
    expect(sent[0]?.screenshot).toBeUndefined();
    expect(tracked).toContainEqual(['Feedback', 'Completed', 'Bug']);
  });

  it('says a stored report as saved', async () => {
    answer = { kind: 'stored' };
    render(<BugReportDialog onClose={() => {}} />);
    fillTitle('x');
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    await screen.findByText('Saved; we will file it shortly.');
  });

  it('sends nothing without a title', () => {
    render(<BugReportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    expect(sent).toEqual([]);
  });

  it.each([
    ['rate_limited', 'You have sent a few reports just now. Try again in a few minutes.'],
    ['too_large', 'The screenshot is too large. Remove it or choose a smaller one.'],
    ['failed', 'Sending failed. Please try again.'],
  ] as const)('keeps the fields and says why on %s', async (reason, copy) => {
    answer = { kind: 'failed', reason };
    render(<BugReportDialog onClose={() => {}} />);
    fillTitle('Save fails');
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    expect((await screen.findByRole('alert')).textContent).toBe(copy);
    expect(screen.getByRole('textbox', { name: 'What went wrong?' })).toHaveProperty(
      'value',
      'Save fails',
    );
  });

  it('attaches nothing until asked, then previews, sends and removes a capture', async () => {
    prepared = { screenshot: { contentType: 'image/png', data: 'AAAA' }, previewUrl: 'blob:x' };
    render(<BugReportDialog onClose={() => {}} />);
    expect(screen.queryByRole('img')).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Capture Screen' })));
    expect(screen.getByRole('img', { name: 'Screenshot to send' })).toBeTruthy();
    expect(screen.getByText('Screenshot added.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Screenshot' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Capture Screen');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Capture Screen' })));
    fillTitle('x');
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    await screen.findByText('Logged as report #7.');
    expect(sent[0]?.screenshot).toEqual({ contentType: 'image/png', data: 'AAAA' });
  });

  it('says a failed capture', async () => {
    render(<BugReportDialog onClose={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Capture Screen' })));
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not capture the screen. Upload an image instead.',
    );
  });

  it('attaches a dropped image, and leaves a drop without one alone', async () => {
    prepared = { screenshot: { contentType: 'image/png', data: 'AAAA' }, previewUrl: 'blob:x' };
    render(<BugReportDialog onClose={() => {}} />);
    const form = screen.getByRole('textbox', { name: 'What went wrong?' }).closest('form')!;
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const image = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });

    fireEvent.dragOver(form);
    await act(async () => fireEvent.drop(form, { dataTransfer: { files: [text] } }));
    expect(screen.queryByRole('img', { name: 'Screenshot to send' })).toBeNull();
    await act(async () => fireEvent.drop(form, { dataTransfer: { files: [image] } }));

    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Screenshot to send' })).toBeTruthy(),
    );
  });

  it("sends with the browser's identity, the guest id where no one is signed in", async () => {
    render(<BugReportDialog onClose={() => {}} />);
    fillTitle('x');
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    await screen.findByText('Logged as report #7.');
    const deps = vi.mocked(sendBugReport).mock.calls.at(-1)![1];

    expect(await deps.identity()).toMatchObject({ 'X-Owner-Id': 'guest-1' });
  });

  it('says no id, and sends without one, where the browser keeps none', async () => {
    guestId = null;
    render(<BugReportDialog onClose={() => {}} />);
    expect(screen.getByText('No id: you are not signed in')).toBeTruthy();
    fillTitle('x');
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    await screen.findByText('Logged as report #7.');
    const deps = vi.mocked(sendBugReport).mock.calls.at(-1)![1];

    await expect(deps.identity()).resolves.not.toHaveProperty('Authorization');
  });

  it('sends once when asked again while sending', async () => {
    render(<BugReportDialog onClose={() => {}} />);
    fillTitle('x');
    const form = screen.getByRole('textbox', { name: 'What went wrong?' }).closest('form')!;

    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByText('Logged as report #7.');

    expect(sent).toHaveLength(1);
  });

  it('counts the title once it nears its limit', () => {
    render(<BugReportDialog onClose={() => {}} />);
    fillTitle('a'.repeat(159));
    expect(screen.queryByText(`159/${BUG_REPORT_LIMITS.title}`)).toBeNull();
    fillTitle('a'.repeat(160));
    expect(screen.getByText(`160/${BUG_REPORT_LIMITS.title}`)).toBeTruthy();
  });

  it('leaves a paste without an image to the field', () => {
    render(<BugReportDialog onClose={() => {}} />);
    fireEvent.paste(screen.getByRole('textbox', { name: 'What went wrong?' }), {
      clipboardData: { files: [] },
    });
    expect(screen.queryByRole('img', { name: 'Screenshot to send' })).toBeNull();
  });

  it('attaches a pasted image', async () => {
    prepared = { screenshot: { contentType: 'image/png', data: 'AAAA' }, previewUrl: 'blob:x' };
    render(<BugReportDialog onClose={() => {}} />);
    const file = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    await act(async () =>
      fireEvent.paste(screen.getByRole('textbox', { name: 'What went wrong?' }), {
        clipboardData: { files: [file] },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Screenshot to send' })).toBeTruthy(),
    );
  });

  it("lists what is attached, the guest id's line included", () => {
    render(<BugReportDialog onClose={() => {}} />);
    expect(screen.getByText("What's Attached")).toBeTruthy();
    expect(screen.getByText('Your guest id')).toBeTruthy();
    expect(screen.getByText('Page')).toBeTruthy();
  });

  // docs/specs/016-platform/bug-reports.md "From an embed": a workbench frame reports as the person's account.
  it('says the account id in a workbench frame, whose report goes with its session', () => {
    setWorkbenchConfinement({ scope: 'document', documentId: 'doc1', ownerId: 'user_1' });
    try {
      render(<BugReportDialog onClose={() => {}} />);
      expect(screen.getByText('Your account id')).toBeTruthy();
      expect(screen.queryByText('Your guest id')).toBeNull();
    } finally {
      setWorkbenchConfinement(null);
    }
  });

  it('keeps the words and the screenshot when closed, and opens on them again', async () => {
    prepared = { screenshot: { contentType: 'image/png', data: 'AAAA' }, previewUrl: 'blob:x' };
    const first = render(<BugReportDialog onClose={() => {}} />);
    fillTitle('Save fails');
    fireEvent.change(screen.getByRole('textbox', { name: /More details/ }), {
      target: { value: 'Spins' },
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Capture Screen' })));
    first.unmount();

    render(<BugReportDialog onClose={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'What went wrong?' })).toHaveProperty(
      'value',
      'Save fails',
    );
    expect(screen.getByRole('textbox', { name: /More details/ })).toHaveProperty('value', 'Spins');
    expect(screen.getByRole('img', { name: 'Screenshot to send' }).getAttribute('src')).toBe(
      'blob:restored',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    await screen.findByText('Logged as report #7.');
    expect(sent[0]).toMatchObject({
      title: 'Save fails',
      details: 'Spins',
      screenshot: { data: 'AAAA' },
    });
  });

  it('clears the draft once sent, and keeps it when sending fails', async () => {
    answer = { kind: 'failed', reason: 'failed' };
    const first = render(<BugReportDialog onClose={() => {}} />);
    fillTitle('Save fails');
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    await screen.findByRole('alert');
    first.unmount();

    answer = { kind: 'stored' };
    const second = render(<BugReportDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    await screen.findByText('Saved; we will file it shortly.');
    second.unmount();

    render(<BugReportDialog onClose={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'What went wrong?' })).toHaveProperty('value', '');
  });

  it('forgets a removed screenshot', async () => {
    prepared = { screenshot: { contentType: 'image/png', data: 'AAAA' }, previewUrl: 'blob:x' };
    const first = render(<BugReportDialog onClose={() => {}} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Capture Screen' })));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Screenshot' }));
    first.unmount();
    render(<BugReportDialog onClose={() => {}} />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('closes from Done', async () => {
    const onClose = vi.fn();
    render(<BugReportDialog onClose={onClose} />);
    fillTitle('x');
    fireEvent.click(screen.getByRole('button', { name: 'Send Report' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
