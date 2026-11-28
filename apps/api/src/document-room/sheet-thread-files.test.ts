import { describe, expect, it } from 'vitest';
import type { SheetThread } from '@livedoc/document';
import { fileThreadsBySheet, threadsFromFile } from './sheet-thread-files';

// docs/specs/029-sheets/standard-mapping.md "Comments in the file": the threads a download writes, by sheet, authors
// by name; and an opened file's threads bounded as any thread is.
const thread = (
  id: string,
  sheetId: string,
  extra: Partial<SheetThread['comments'][number]> = {},
): SheetThread => ({
  id,
  sheetId,
  anchor: { r1: 'r', c1: 'c', r2: 'r', c2: 'c' },
  resolved: false,
  comments: [
    {
      id: `${id}c`,
      text: 'Hi',
      at: 1,
      author: { key: 'k', name: 'Ada', colour: '#111111' },
      ...extra,
    },
  ],
  v: 1,
});

describe('fileThreadsBySheet', () => {
  it('groups the workbook’s threads by sheet, each comment by its author’s name with what it holds', () => {
    const by = fileThreadsBySheet([
      thread('a', 's1', {
        edited: 2,
        mentions: [{ handle: 'p' }],
        assignee: { handle: 'p' },
        reactions: { '👍': ['k'] },
      }),
      thread('b', 's2'),
      thread('c', 's1', { mentions: [] }),
    ]);
    expect([...by.keys()]).toEqual(['s1', 's2']);
    expect(by.get('s1')!.map((t) => t.comments[0])).toEqual([
      {
        text: 'Hi',
        at: 1,
        author: 'Ada',
        colour: '#111111',
        edited: 2,
        mentions: [{ handle: 'p' }],
        assignee: { handle: 'p' },
        reactions: { '👍': ['k'] },
      },
      { text: 'Hi', at: 1, author: 'Ada', colour: '#111111' },
    ]);
  });
});

describe('threadsFromFile', () => {
  const layout = { rows: ['r'], cols: ['c'] };
  const one = {
    anchor: { r1: 'r', c1: 'c', r2: 'r', c2: 'c' },
    resolved: false,
    comments: [{ text: 'x', at: 1, author: 'A' }],
  };
  it('stops at the most threads a sheet holds, and leaves out reactions it cannot hold', () => {
    let n = 0;
    const made = threadsFromFile(
      's',
      layout,
      Array.from({ length: 1001 }, () => one),
      () => `id${n++}`,
    );
    expect(made).toHaveLength(1000);
    const [reacted] = threadsFromFile(
      's',
      layout,
      [{ ...one, comments: [{ ...one.comments[0], reactions: { '👍': [] }, at: 2 }] }],
      () => 'i',
    );
    expect(reacted!.comments[0]).not.toHaveProperty('reactions');
  });
});
