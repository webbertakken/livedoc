// editing-surface.md "The title row" (Last edit): how long ago, in words, and who.
import { describe, expect, it } from 'vitest';
import { lastEditAgo, lastEditWords } from './text-document-last-edit';

const now = Date.UTC(2026, 10, 27, 12);
const ADA = { key: 'k', name: 'Ada', color: '#0284c7' };

describe('last edit', () => {
  it('says just now, then minutes, hours and days ago', () => {
    expect(lastEditAgo(now - 30_000, now)).toBe('just now');
    expect(lastEditAgo(now + 5_000, now)).toBe('just now');
    expect(lastEditAgo(now - 60_000, now)).toBe('1 minute ago');
    expect(lastEditAgo(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(lastEditAgo(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(lastEditAgo(now - 2 * 86_400_000, now)).toBe('2 days ago');
  });

  it('names who sent it, Someone where no one was recorded', () => {
    expect(lastEditWords({ at: now - 5 * 60_000, editor: ADA }, now)).toBe(
      'Last edit was 5 minutes ago by Ada',
    );
    expect(lastEditWords({ at: now, editor: { key: null, name: null, color: null } }, now)).toBe(
      'Last edit was just now by Someone',
    );
  });
});
