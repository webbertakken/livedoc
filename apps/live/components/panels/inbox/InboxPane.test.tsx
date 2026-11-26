// @vitest-environment jsdom

// The Inbox as a list and a reading pane (docs/specs/013-workspace/inbox.md §1): the listbox and its keys, the filter
// bar, the pane and its verbs, a done row leaving at once, the narrow layout's Back to Inbox, and the telemetry.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityRowKey, type ActivityFeed } from '@/app/explorer/useActivityFeed';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));
const api = vi.hoisted(() => ({
  apiAddComment: vi.fn(),
  apiListCommentThreads: vi.fn(),
  apiSetThreadResolved: vi.fn(),
}));
vi.mock('@/lib/api-client', () => api);
const media = vi.hoisted(() => ({ narrow: false }));
vi.mock('@livedoc/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@livedoc/ui')>()),
  useMediaQuery: () => media.narrow,
}));

import { InboxPane } from './InboxPane';
import { INBOX_PANE_STATE } from './useInboxPaneHistory';
import { action, card, feedOf, form, thread } from './inbox-test-utils';
import type { InboxDone } from './inbox-verbs';

const NOW = Date.now();
const HOUR = 3_600_000;

const rows = (): Partial<ActivityFeed> => ({
  threads: [{ kind: 'thread', ...thread({ latest: { ...thread().latest, at: NOW - HOUR } }) }],
  assignedToMe: [
    { kind: 'action', ...action({ updatedAt: NOW - 2 * HOUR }) },
    { kind: 'card', ...card({ updatedAt: NOW - 30 * 24 * HOUR }) },
  ],
  formResponses: [form({ latestAt: NOW - 40 * 24 * HOUR })],
});

// A feed whose dismiss really drops the row, as useActivityFeed's does.
function Harness({
  initial,
  compact,
  done,
  onFeed,
}: {
  initial: Partial<ActivityFeed>;
  compact?: boolean;
  done?: InboxDone | null;
  onFeed?: (set: (f: Partial<ActivityFeed>) => void) => void;
}) {
  const [over, setOver] = useState(initial);
  const [gone, setGone] = useState<string[]>([]);
  onFeed?.(setOver);
  const keep = <T extends object>(list: T[] | undefined, key: (r: T) => string) =>
    (list ?? []).filter((r) => !gone.includes(key(r)));
  const feed = feedOf({
    ...over,
    threads: keep(over.threads, (t) =>
      t.kind === 'thread' ? activityRowKey.thread(t) : activityRowKey.cardThread(t),
    ),
    assignedToMe: keep(over.assignedToMe, (a) =>
      a.kind === 'action' ? activityRowKey.action(a) : activityRowKey.card(a),
    ),
    dismiss: (key) => setGone((g) => [...g, key]),
  });
  return <InboxPane feed={feed} ownerId="me" compact={compact} done={done} />;
}

const list = () => screen.getByRole('listbox');
const options = () => within(list()).getAllByRole('option');
const chosen = () => options().find((o) => o.getAttribute('aria-selected') === 'true');
const pane = () => document.querySelector<HTMLElement>('[data-inbox-reader]');

beforeEach(() => {
  media.narrow = false;
  track.mockReset();
  for (const fn of Object.values(api)) fn.mockReset();
  localStorage.clear();
  window.history.replaceState({ page: 'inbox' }, '');
});
afterEach(() => vi.useRealTimers());

describe('the list', () => {
  it('lists every row newest first under its date divider, the first chosen beside its pane', () => {
    render(<Harness initial={rows()} />);
    expect(options().map((o) => o.dataset.inboxRow)).toEqual([
      'Thread',
      'Action',
      'Card',
      'FormResponses',
    ]);
    const dividers = [...document.querySelectorAll('[data-inbox-bucket]')].map(
      (d) => d.textContent,
    );
    expect(dividers[0]).toMatch(/Today|Earlier This Week/);
    expect(dividers.at(-1)).toBe('Older');
    expect(list().getAttribute('aria-label')).toBe('Inbox, All');
    expect(chosen()?.dataset.inboxRow).toBe('Thread');
    expect(within(pane()!).getByRole('heading', { name: 'Gateway' })).toBeTruthy();
    expect(track).toHaveBeenCalledWith('Activity', 'Opened');
  });

  it('moves the choice with j, k, the arrows, Home and End, focus staying on the list', () => {
    render(<Harness initial={rows()} />);
    list().focus();
    fireEvent.keyDown(list(), { key: 'j' });
    expect(chosen()?.dataset.inboxRow).toBe('Action');
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    expect(chosen()?.dataset.inboxRow).toBe('Card');
    fireEvent.keyDown(list(), { key: 'k' });
    expect(chosen()?.dataset.inboxRow).toBe('Action');
    fireEvent.keyDown(list(), { key: 'End' });
    expect(chosen()?.dataset.inboxRow).toBe('FormResponses');
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    expect(chosen()?.dataset.inboxRow).toBe('FormResponses');
    fireEvent.keyDown(list(), { key: 'Home' });
    expect(chosen()?.dataset.inboxRow).toBe('Thread');
    expect(list().getAttribute('aria-activedescendant')).toBe(chosen()?.id);
    expect(document.activeElement).toBe(list());
  });

  it('opens the chosen row in the editor on Enter', () => {
    render(<Harness initial={rows()} />);
    fireEvent.keyDown(list(), { key: 'j' });
    const open = within(pane()!).getByRole('link', { name: /Open/ });
    expect(open.getAttribute('href')).toBe('/document/d1#t=t1&el=e-a1&open=action');
    const click = vi.fn((e: Event) => e.preventDefault());
    open.addEventListener('click', click);
    fireEvent.keyDown(list(), { key: 'Enter' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Activity', 'Selected', 'Action');
  });
});

describe('the filter bar', () => {
  it('counts each filter, keeps the choice and reports it', () => {
    render(<Harness initial={rows()} />);
    const bar = screen.getByRole('group', { name: 'Inbox filters' });
    expect(within(bar).getByRole('button', { name: 'My Actions 2' })).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: 'Comments 1' }));
    expect(options().map((o) => o.dataset.inboxRow)).toEqual(['Thread']);
    expect(
      within(bar).getByRole('button', { name: 'Comments 1' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(localStorage.getItem('livedoc:explorer-inbox-filter:me')).toBe('comments');
    expect(track).toHaveBeenCalledWith('Activity', 'Changed', 'Comments');
    expect(document.querySelector('[data-inbox-live]')?.textContent).toBe('Comments: 1 row');
  });

  it('says when a filter holds nothing, with Show All', () => {
    render(<Harness initial={rows()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assigned by Me 0' }));
    expect(screen.getByText('Nothing in Assigned by Me')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show All' }));
    expect(options()).toHaveLength(4);
  });
});

describe('the verbs', () => {
  const listed = {
    tabId: 't1',
    tabName: 'Flow',
    elementId: 'e9',
    ref: 'shape:e9',
    label: 'Gateway',
    resolved: false,
    comments: [
      { id: 'c-first', text: 'Hi', createdAt: 1, authorName: 'Priya', authorColor: '#336699' },
    ],
  };

  it('replies to a thread: r focuses the field, Send posts it', async () => {
    api.apiAddComment.mockResolvedValue({ id: 'c2' });
    render(<Harness initial={rows()} />);
    fireEvent.keyDown(list(), { key: 'r' });
    const field = screen.getByRole('textbox', { name: 'Reply' });
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: 'On it' } });
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(track).toHaveBeenCalledWith('Activity', 'Added', 'Reply'));
    expect(api.apiAddComment).toHaveBeenCalledWith('me', 'd1', 't1', 'e9', 'On it', null);
    expect((field as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByText('On it')).toBeTruthy();
  });

  it('resolves a thread with e, and the row leaves at once', async () => {
    api.apiListCommentThreads.mockResolvedValue([listed]);
    api.apiSetThreadResolved.mockResolvedValue(undefined);
    render(<Harness initial={rows()} />);
    fireEvent.keyDown(list(), { key: 'e' });
    await waitFor(() => expect(track).toHaveBeenCalledWith('Activity', 'Resolved', 'Thread'));
    expect(api.apiSetThreadResolved).toHaveBeenCalledWith('me', 'd1', 't1', 'c-first', true, null);
    expect(options().map((o) => o.dataset.inboxRow)).toEqual(['Action', 'Card', 'FormResponses']);
    expect(document.querySelector('[data-inbox-live]')?.textContent).toBe('Resolved Gateway');
  });

  it('keeps the row and says so when resolving fails', async () => {
    api.apiListCommentThreads.mockRejectedValue(new Error('403'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Harness initial={rows()} />);
    fireEvent.click(within(pane()!).getByRole('button', { name: /Resolve/ }));
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't resolve the thread.");
    expect(options()).toHaveLength(4);
  });

  it('shows the whole thread once the choice rests', async () => {
    vi.useFakeTimers();
    api.apiListCommentThreads.mockResolvedValue([
      {
        ...listed,
        comments: [...listed.comments, { ...listed.comments[0]!, id: 'c2', text: 'Still there?' }],
      },
    ]);
    render(<Harness initial={rows()} />);
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(within(pane()!).getByText('Hi')).toBeTruthy();
    expect(within(pane()!).getByText('Still there?')).toBeTruthy();
  });

  it('reads nothing for a text document’s thread and shows its latest comment, Open alone (D229)', async () => {
    vi.useFakeTimers();
    render(
      <Harness
        initial={{
          threads: [
            {
              kind: 'thread',
              ...thread({ anchor: 'text', latest: { ...thread().latest, at: NOW } }),
            },
          ],
        }}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(api.apiListCommentThreads).not.toHaveBeenCalled();
    expect(within(pane()!).getByText('Any news?')).toBeTruthy();
    const verbs = within(pane()!.querySelector('[data-inbox-verbs]') as HTMLElement);
    expect(verbs.queryAllByRole('button')).toHaveLength(0);
  });

  it('offers only Open on a thread reached through a view link, a card, a form or This Browser', () => {
    render(
      <Harness
        initial={{
          threads: [
            {
              kind: 'thread',
              ...thread({ canComment: false, latest: { ...thread().latest, at: NOW } }),
            },
            {
              kind: 'thread',
              ...thread({ elementId: 'e-local', latest: { ...thread().latest, at: NOW - 1 } }),
              local: true,
            },
          ],
          assignedToMe: [{ kind: 'card', ...card({ updatedAt: NOW - 2 }) }],
          formResponses: [form({ latestAt: NOW - 3 })],
        }}
      />,
    );
    for (let i = 0; i < 4; i += 1) {
      const verbs = within(pane()!.querySelector('[data-inbox-verbs]') as HTMLElement);
      expect(verbs.queryAllByRole('button')).toHaveLength(0);
      expect(verbs.getByRole('link', { name: /Open/ })).toBeTruthy();
      fireEvent.keyDown(list(), { key: 'j' });
    }
  });

  it('marks an action on the editor’s open tab done', async () => {
    const markDone = vi.fn();
    media.narrow = false;
    render(
      <Harness
        compact
        done={{ documentId: 'd1', tabId: 't1', markDone }}
        initial={{ assignedToMe: [{ kind: 'action', ...action({ updatedAt: NOW }) }] }}
      />,
    );
    fireEvent.click(options()[0]!);
    fireEvent.keyDown(pane()!, { key: 'e' });
    expect(markDone).toHaveBeenCalledWith('e-a1', 'a1');
    expect(track).toHaveBeenCalledWith('Activity', 'Resolved', 'Action');
    await waitFor(() => expect(screen.getByText('Nothing waiting on you')).toBeTruthy());
  });
});

describe('narrow', () => {
  const flagged = () =>
    (window.history.state as Record<string, unknown> | null)?.[INBOX_PANE_STATE] === true;

  it('opens the pane in the list’s place, with one history entry, and Back to Inbox returns', async () => {
    media.narrow = true;
    render(<Harness initial={rows()} />);
    expect(pane()).toBeNull();
    fireEvent.keyDown(list(), { key: 'j' });
    fireEvent.keyDown(list(), { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(flagged()).toBe(true);
    expect(window.history.state).toMatchObject({ page: 'inbox' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to Inbox' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    await waitFor(() => expect(flagged()).toBe(false));
  });

  it('returns to the list on Escape and on the browser’s Back', async () => {
    media.narrow = true;
    render(<Harness initial={rows()} />);
    fireEvent.click(options()[0]!);
    fireEvent.keyDown(pane()!, { key: 'Escape' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    await waitFor(() => expect(flagged()).toBe(false));
    fireEvent.click(options()[0]!);
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
  });

  it('steps back off its entry when the open row vanishes on a re-read', async () => {
    media.narrow = true;
    let setFeed: (f: Partial<ActivityFeed>) => void = () => {};
    render(<Harness initial={rows()} onFeed={(s) => (setFeed = s)} />);
    fireEvent.click(options()[0]!);
    expect(flagged()).toBe(true);
    act(() => setFeed({ ...rows(), threads: [] }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    await waitFor(() => expect(flagged()).toBe(false));
  });
});

describe('the states', () => {
  it('keeps loading, failed and empty apart', () => {
    const retry = vi.fn();
    const { rerender } = render(<InboxPane feed={feedOf({ loading: true })} ownerId="me" />);
    expect(document.querySelector('[data-inbox-skeleton]')).toBeTruthy();
    rerender(<InboxPane feed={feedOf({ error: true, retry })} ownerId="me" />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    rerender(<InboxPane feed={feedOf()} ownerId="me" />);
    expect(screen.getByText('Nothing waiting on you')).toBeTruthy();
  });
});
