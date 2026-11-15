// A document's History (docs/specs/013-workspace/timeline.md §2.10): its pure rules, the day
// headings, the runs that fold, the filter's chips, the summary strip and when it was made.

import { describe, expect, it } from 'vitest';
import { cpuNowMs } from '@livedoc/vitest-config/cpu-time';
import {
  buildHistory,
  eventCountLabel,
  filterHistory,
  historyCategories,
  historyCreatedAt,
  historyDayLabel,
  summariseHistory,
} from './history';
import type { TimelineEvent } from './types';

// Who an event is by, as the host tells people apart: here the actor id, else the name it carries.
const personKey = (e: TimelineEvent) =>
  e.actorId ?? (typeof e.snapshot.authorName === 'string' ? e.snapshot.authorName : null);

// Sunday 25 October 2026, mid-afternoon, local time.
const NOW = new Date(2026, 9, 25, 15, 0).getTime();
const at = (daysAgo: number, hour = 12) => new Date(2026, 9, 25 - daysAgo, hour).getTime();

function event(over: Partial<TimelineEvent> & { id: string }): TimelineEvent {
  return {
    sourceType: 'document',
    sourceId: 'd1',
    eventType: 'document_edited',
    title: 'Document Edited',
    description: null,
    occurredAt: NOW,
    actorId: 'me',
    snapshot: { documentId: 'd1', documentName: 'Payments' },
    ...over,
  };
}

describe('historyDayLabel', () => {
  it('says Today, Yesterday, the weekday within a week, then the date', () => {
    expect(historyDayLabel('2026-10-25', NOW)).toBe('Today');
    expect(historyDayLabel('2026-10-24', NOW)).toBe('Yesterday');
    expect(historyDayLabel('2026-10-21', NOW)).toBe('Wednesday');
    expect(historyDayLabel('2026-10-19', NOW)).toBe('Monday');
    expect(historyDayLabel('2026-10-18', NOW)).toBe('Sun, 18 Oct');
  });

  it('adds the year to a date from another year', () => {
    expect(historyDayLabel('2025-12-30', NOW)).toBe('Tue, 30 Dec 2025');
  });

  it('dates a forward-dated day rather than calling it a weekday', () => {
    expect(historyDayLabel('2026-10-27', NOW)).toBe('Tue, 27 Oct');
  });

  it('hands back a key it cannot read', () => {
    expect(historyDayLabel('not-a-day', NOW)).toBe('not-a-day');
  });
});

describe('buildHistory', () => {
  it('groups by local day and folds consecutive events of one type by one person', () => {
    const events = [
      event({ id: 'a', occurredAt: at(0, 14) }),
      event({ id: 'b', occurredAt: at(0, 13) }),
      event({ id: 'c', occurredAt: at(0, 12), actorId: 'ada' }),
      event({ id: 'd', occurredAt: at(0, 11) }),
      // Same type and person as the last, but another day: a run never crosses a day.
      event({ id: 'e', occurredAt: at(1, 11) }),
    ];
    const days = buildHistory(events, NOW, personKey);
    expect(days.map((d) => [d.label, d.count])).toEqual([
      ['Today', 4],
      ['Yesterday', 1],
    ]);
    expect(days[0]!.runs.map((r) => r.events.map((e) => e.id))).toEqual([['a', 'b'], ['c'], ['d']]);
  });

  it('keeps events of different types apart, even by one person', () => {
    const events = [
      event({ id: 'a', occurredAt: at(0, 14) }),
      event({ id: 'b', occurredAt: at(0, 13), eventType: 'comment_added' }),
    ];
    expect(buildHistory(events, NOW, personKey)[0]!.runs).toHaveLength(2);
  });

  it('tells people apart by the host’s key, not the actor id alone', () => {
    const events = [
      event({
        id: 'a',
        actorId: null,
        eventType: 'comment_added',
        snapshot: { authorName: 'Ada' },
      }),
      event({
        id: 'b',
        actorId: null,
        eventType: 'comment_added',
        snapshot: { authorName: 'Grace' },
      }),
      event({
        id: 'c',
        actorId: null,
        eventType: 'comment_added',
        snapshot: { authorName: 'Grace' },
      }),
    ];
    expect(buildHistory(events, NOW, personKey)[0]!.runs.map((r) => r.events.length)).toEqual([
      1, 2,
    ]);
  });

  it('folds events that name nobody as one person', () => {
    const events = [
      event({ id: 'a', actorId: null, eventType: 'share_link_expiring' }),
      event({ id: 'b', actorId: null, eventType: 'share_link_expiring' }),
    ];
    expect(buildHistory(events, NOW, personKey)[0]!.runs[0]!.events).toHaveLength(2);
  });

  it('has nothing to group for nothing loaded', () => {
    expect(buildHistory([], NOW, personKey)).toEqual([]);
  });

  it('works out 1,000 loaded events inside a frame', () => {
    const events = Array.from({ length: 1_000 }, (_, i) =>
      event({
        id: `e${i}`,
        eventType: i % 3 ? 'document_edited' : 'comment_added',
        actorId: `u${i % 4}`,
        occurredAt: NOW - i * 600_000,
      }),
    );
    const started = cpuNowMs();
    const days = buildHistory(events, NOW, personKey);
    historyCategories(events);
    summariseHistory(events, personKey);
    const ms = cpuNowMs() - started;
    expect(days.reduce((n, d) => n + d.count, 0)).toBe(1_000);
    expect(ms).toBeLessThan(16);
  });
});

describe('the filter', () => {
  const events = [
    event({ id: 'a', eventType: 'document_edited', actorId: 'me' }),
    event({ id: 'b', eventType: 'share_link_created', actorId: 'ada' }),
    event({ id: 'c', eventType: 'team_document_added', actorId: 'me' }),
    event({ id: 'd', eventType: 'document_moved', actorId: null }),
  ];

  it('offers each kind present once, in the fixed order, with counts', () => {
    expect(historyCategories(events)).toEqual([
      { category: 'edits', count: 1 },
      { category: 'sharing', count: 2 },
      { category: 'filing', count: 1 },
    ]);
  });

  it('narrows to one kind, and All is the events themselves', () => {
    expect(filterHistory(events, 'sharing').map((e) => e.id)).toEqual(['b', 'c']);
    expect(filterHistory(events, null)).toBe(events);
  });
});

describe('the summary', () => {
  it('counts the events and the people who took part, newest first', () => {
    const summary = summariseHistory(
      [
        event({ id: 'a', actorId: 'me' }),
        event({ id: 'b', actorId: null, snapshot: { authorName: 'Ada' } }),
        event({ id: 'c', actorId: 'me' }),
        event({ id: 'd', actorId: null }),
        event({ id: 'e', actorId: null, snapshot: { authorName: 'Ada' } }),
      ],
      personKey,
    );
    expect(summary.count).toBe(5);
    expect(summary.people.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('says how many events, with a plus while older ones remain', () => {
    expect(eventCountLabel(1, false)).toBe('1 event');
    expect(eventCountLabel(0, false)).toBe('0 events');
    expect(eventCountLabel(50, true)).toBe('50+ events');
    expect(eventCountLabel(1, true)).toBe('1+ events');
  });
});

describe('historyCreatedAt', () => {
  const created = event({ id: 'c', eventType: 'document_created', occurredAt: at(3) });

  it('takes the document’s own createdAt first', () => {
    expect(historyCreatedAt(at(9), [created])).toBe(at(9));
  });

  it('falls back to a loaded Document Created event', () => {
    expect(historyCreatedAt(undefined, [event({ id: 'e' }), created])).toBe(at(3));
  });

  it('is unknown rather than guessed with neither', () => {
    expect(historyCreatedAt(undefined, [event({ id: 'e' })])).toBeNull();
  });
});
