// docs/specs/029-sheets/standard-mapping.md "Comments in the file": LiveDoc's record of a thread read back only as it
// was written; a thread's conversation as text; the reading limits; ids and positions both ways.
import { describe, expect, it } from 'vitest';
import {
  FILE_COMMENT_TEXT_MAX,
  FILE_THREAD_COMMENTS_MAX,
  FILE_THREADS_MAX,
  fileThreadsOf,
  idThreadsOf,
  readThreadRecord,
  threadFingerprint,
  threadLines,
  threadRecordJson,
  threadBatches,
  threadsWithinLimits,
  type FileThread,
} from './file-threads';

const said = (text: string, author = 'Ada') => ({ text, at: 1, author });
const thread = (extra: Partial<FileThread> = {}): FileThread => ({
  r1: 0,
  c1: 0,
  r2: 1,
  c2: 2,
  resolved: false,
  comments: [said('Hi')],
  ...extra,
});

describe('the record', () => {
  it('reads back what it wrote, with the cell’s note', () => {
    const t = thread({
      comments: [
        {
          ...said('a'),
          colour: '#000',
          edited: 2,
          mentions: [{ handle: 'p' }],
          assignee: { handle: 'p' },
          reactions: { '👍': ['k'] },
        },
      ],
    });
    expect(readThreadRecord(threadRecordJson(t, 'Note'))).toEqual({
      range: { r1: 0, c1: 0, r2: 1, c2: 2 },
      resolved: false,
      comments: t.comments,
      note: 'Note',
    });
    expect(readThreadRecord(threadRecordJson(t, undefined))).not.toHaveProperty('note');
  });

  it('refuses one LiveDoc did not write', () => {
    for (const json of [
      'nope',
      '[]',
      '{"range":{"r1":0,"c1":0,"r2":0,"c2":0}}',
      '{"range":{"r1":1,"c1":0,"r2":0,"c2":0},"resolved":false,"comments":[{"text":"a","at":1,"author":"x"}]}',
      '{"range":{"r1":0,"c1":-1,"r2":0,"c2":0},"resolved":false,"comments":[{"text":"a","at":1,"author":"x"}]}',
      '{"range":[],"resolved":false,"comments":[]}',
      '{"range":{"r1":0,"c1":0,"r2":0,"c2":0},"resolved":false,"comments":{}}',
      '{"range":{"r1":0,"c1":0,"r2":0,"c2":0},"resolved":false,"comments":[]}',
      '{"range":{"r1":0,"c1":0,"r2":0,"c2":0},"resolved":false,"comments":[{"text":"a","at":"1","author":"x"}]}',
      '{"range":{"r1":0,"c1":0,"r2":0,"c2":0},"resolved":false,"comments":[7]}',
    ])
      expect(readThreadRecord(json), json).toBeNull();
  });

  it('drops what a comment holds wrongly, and cuts a long text', () => {
    const json = JSON.stringify({
      range: { r1: 0, c1: 0, r2: 0, c2: 0 },
      resolved: true,
      note: 7,
      comments: [
        {
          text: 'x'.repeat(FILE_COMMENT_TEXT_MAX + 5),
          at: 1,
          author: 'A',
          colour: 3,
          edited: 'no',
          reactions: { a: [1], b: ['k'] },
        },
      ],
    });
    expect(readThreadRecord(json)).toEqual({
      range: { r1: 0, c1: 0, r2: 0, c2: 0 },
      resolved: true,
      comments: [
        { text: 'x'.repeat(FILE_COMMENT_TEXT_MAX), at: 1, author: 'A', reactions: { b: ['k'] } },
      ],
    });
    const bare = JSON.stringify({
      range: { r1: 0, c1: 0, r2: 0, c2: 0 },
      resolved: false,
      comments: [{ text: 'y', at: 1, author: 'A', reactions: [] }],
    });
    expect(readThreadRecord(bare)!.comments[0]).toEqual({ text: 'y', at: 1, author: 'A' });
  });
});

describe('the conversation as text', () => {
  it('gives the first comment, then each reply after its author, a line each', () => {
    expect(threadLines({ comments: [said('One\nTwo'), said('Yes\nno', 'Bo')] })).toEqual([
      'One',
      'Two',
      'Bo: Yes',
      'no',
    ]);
    expect(threadLines({ comments: [] })).toEqual([]);
    expect(threadFingerprint(['a'])).toMatch(/^[0-9a-f]{8}$/);
    expect(threadFingerprint(['a'])).not.toBe(threadFingerprint(['b']));
  });
});

describe('threadsWithinLimits', () => {
  it('cuts threads, comments and texts past the limits, counting each', () => {
    const many = Array.from({ length: FILE_THREADS_MAX + 2 }, () => thread());
    expect(threadsWithinLimits(many)).toMatchObject({ cut: 2 });
    const long = thread({
      comments: [
        said('x'.repeat(FILE_COMMENT_TEXT_MAX + 1)),
        ...Array.from({ length: FILE_THREAD_COMMENTS_MAX }, () => said('y')),
      ],
    });
    const kept = threadsWithinLimits([long]);
    expect(kept.cut).toBe(2);
    expect(kept.threads[0]!.comments).toHaveLength(FILE_THREAD_COMMENTS_MAX);
    expect(kept.threads[0]!.comments[0]!.text).toHaveLength(FILE_COMMENT_TEXT_MAX);
  });
});

describe('ids and positions', () => {
  const layout = { rows: ['r0', 'r1', 'r2'], cols: ['c0', 'c1'] };
  it('places threads by their ids in reading order, leaving out a deleted one or an empty one', () => {
    expect(
      fileThreadsOf(layout, [
        {
          anchor: { r1: 'r2', c1: 'c0', r2: 'r2', c2: 'c0' },
          resolved: false,
          comments: [said('b')],
        },
        {
          anchor: { r1: 'r0', c1: 'c1', r2: 'r1', c2: 'c1' },
          resolved: true,
          comments: [said('a')],
        },
        {
          anchor: { r1: 'rX', c1: 'c1', r2: 'rX', c2: 'c1' },
          resolved: false,
          comments: [said('gone')],
        },
        { anchor: { r1: 'r1', c1: 'c0', r2: 'r1', c2: 'c0' }, resolved: false, comments: [] },
      ]).map((t) => [t.r1, t.c1, t.r2, t.c2, t.comments[0]!.text]),
    ).toEqual([
      [0, 1, 1, 1, 'a'],
      [2, 0, 2, 0, 'b'],
    ]);
  });

  it('names a file’s threads by the made sheet’s ids, leaving out one past it', () => {
    expect(idThreadsOf(layout, [thread({ r2: 2, c2: 1 }), thread({ r2: 5 })])).toEqual([
      {
        anchor: { r1: 'r0', c1: 'c0', r2: 'r2', c2: 'c1' },
        resolved: false,
        comments: [said('Hi')],
      },
    ]);
    expect(idThreadsOf(layout, undefined)).toEqual([]);
  });
});

describe('threadBatches', () => {
  const t = (text: string) => ({
    anchor: { r1: 'r', c1: 'c', r2: 'r', c2: 'c' },
    resolved: false,
    comments: [{ text, at: 1, author: 'A' }],
  });
  it('parts the threads by size, a thread past it a part of its own', () => {
    const size = JSON.stringify(t('aaaa')).length;
    expect(threadBatches([t('aaaa'), t('bbbb'), t('cccc')], size * 2).map((b) => b.length)).toEqual(
      [2, 1],
    );
    expect(threadBatches([t('x'.repeat(500)), t('y')], 100).map((b) => b.length)).toEqual([1, 1]);
    expect(threadBatches([])).toEqual([]);
  });
});
