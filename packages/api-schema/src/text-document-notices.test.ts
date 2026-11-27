import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTICE_SETTING,
  noticeSettingType,
  parseNoticeSetting,
} from './text-document-notices';

// docs/specs/034-text-documents/review.md "Notifications" (The setting): per document, per person.
describe('notice settings', () => {
  it('defaults to comments for you and no edits, as Google Docs', () => {
    expect(DEFAULT_NOTICE_SETTING).toEqual({ comments: 'for-you', edits: 'none' });
  });

  it('reads every choice the dialog offers', () => {
    for (const comments of ['all', 'for-you', 'none'] as const)
      for (const edits of ['added-or-removed', 'none'] as const)
        expect(parseNoticeSetting({ comments, edits })).toEqual({ comments, edits });
  });

  it('refuses anything else', () => {
    expect(parseNoticeSetting(null)).toBeNull();
    expect(parseNoticeSetting([])).toBeNull();
    expect(parseNoticeSetting({ comments: 'all' })).toBeNull();
    expect(parseNoticeSetting({ comments: 'some', edits: 'none' })).toBeNull();
    expect(parseNoticeSetting({ comments: 'all', edits: 'daily' })).toBeNull();
  });

  it('keeps only the two choices', () => {
    expect(parseNoticeSetting({ comments: 'none', edits: 'none', extra: 1 })).toEqual({
      comments: 'none',
      edits: 'none',
    });
  });

  it('names each pair as a telemetry type', () => {
    expect(noticeSettingType({ comments: 'all', edits: 'added-or-removed' })).toBe(
      'AllAddedOrRemoved',
    );
    expect(noticeSettingType({ comments: 'for-you', edits: 'none' })).toBe('ForYouNone');
    expect(noticeSettingType({ comments: 'none', edits: 'none' })).toBe('NoneNone');
  });
});
