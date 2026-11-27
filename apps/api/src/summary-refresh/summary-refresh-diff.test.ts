import { describe, expect, it } from 'vitest';
import type { ContentSummary } from '../db/content-summary';
import { losesContent, summaryDiffOf } from './summary-refresh-diff';

// docs/specs/006-document/document-storage.md "Refreshing the summaries", What changed: the fields that differ by name,
// hasContent before and after, and the numeric differences; never a tab's id, a name or any text.

const base: ContentSummary = {
  v: 1,
  tabs: 2,
  firstTabCount: 4,
  tabCounts: { 'tab-a': 4, 'tab-b': 1 },
  stats: { mode: 'diagram', elements: 5, comments: 0, bytes: 900 },
  hasContent: true,
};
const text = (s: ContentSummary) => JSON.stringify(s);

describe('summaryDiffOf', () => {
  it('names nothing when the stored summary is the fresh one', () => {
    expect(summaryDiffOf(text(base), base)).toEqual({
      fields: [],
      hasContentBefore: true,
      hasContentAfter: true,
      deltas: {},
    });
  });

  it('names each field that differs, with its numeric difference', () => {
    const fresh: ContentSummary = {
      ...base,
      tabs: 3,
      firstTabCount: 6,
      tabCounts: { 'tab-a': 6, 'tab-b': 1, 'tab-c': 0 },
      stats: { mode: 'draw', elements: 7, comments: 1, bytes: 850 },
      textDocument: true,
    };
    const diff = summaryDiffOf(text(base), fresh);
    expect(diff.fields).toEqual([
      'tabs',
      'firstTabCount',
      'tabCounts',
      'stats.mode',
      'stats.elements',
      'stats.comments',
      'stats.bytes',
      'textDocument',
    ]);
    expect(diff.deltas).toEqual({
      tabs: 1,
      firstTabCount: 2,
      tabCounts: 2,
      elements: 2,
      comments: 1,
      bytes: -50,
    });
  });

  it('keeps no tab id, name or text in what it records', () => {
    const fresh: ContentSummary = { ...base, tabCounts: { 'secret-tab-id': 9 } };
    expect(JSON.stringify(summaryDiffOf(text(base), fresh))).not.toMatch(/tab-a|tab-b|secret/);
  });

  it('names stats whole when one side has none', () => {
    const diff = summaryDiffOf(text({ ...base, stats: null }), base);
    expect(diff.fields).toEqual(['stats']);
    expect(diff.deltas).toEqual({});
  });

  it('names the order alone when every value is the same but the text is not', () => {
    const { hasContent, ...rest } = base;
    const reordered = JSON.stringify({ hasContent, ...rest });
    expect(summaryDiffOf(reordered, base).fields).toEqual(['order']);
  });

  it('names other when a key no field names differs', () => {
    const extra = JSON.stringify({ ...base, legacy: 1 });
    expect(summaryDiffOf(extra, base).fields).toEqual(['other']);
  });

  it('names a missing or unparseable stored summary, its hasContent unknown', () => {
    expect(summaryDiffOf(null, base)).toEqual({
      fields: ['missing'],
      hasContentBefore: null,
      hasContentAfter: true,
      deltas: {},
    });
    expect(summaryDiffOf('{not json', base).fields).toEqual(['unparseable']);
    expect(summaryDiffOf('{not json', base).hasContentBefore).toBeNull();
  });

  it('records hasContent flipping either way, and only true to false loses content', () => {
    const lost = summaryDiffOf(text(base), { ...base, hasContent: false });
    expect(lost.fields).toEqual(['hasContent']);
    expect(losesContent(lost)).toBe(true);
    const gained = summaryDiffOf(text({ ...base, hasContent: false }), base);
    expect([gained.hasContentBefore, gained.hasContentAfter]).toEqual([false, true]);
    expect(losesContent(gained)).toBe(false);
    expect(losesContent(summaryDiffOf(null, { ...base, hasContent: false }))).toBe(false);
  });
});
