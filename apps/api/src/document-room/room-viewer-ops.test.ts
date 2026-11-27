import { describe, expect, it } from 'vitest';
import { viewerOpOf, type ViewerOps } from './room-viewer-ops';

// review.md "What a Viewer receives": a Viewer never receives a text document's update, only its copy's.

describe('viewerOpOf', () => {
  const update = { kind: 'text-document', tabId: 't1', update: 'real' };
  const copied = { kind: 'text-document', tabId: 't1', update: 'copy', viewerCopy: 'c1' };

  it('gives the copy’s op in place of the update it was sequenced beside', () => {
    const ops: ViewerOps = new WeakMap([[update, copied]]);
    expect(viewerOpOf(update, ops, 'drop')).toBe(copied);
    expect(viewerOpOf(update, ops, 'stale')).toBe(copied);
  });

  it('gives nothing where the copy gained nothing', () => {
    const ops: ViewerOps = new WeakMap([[update, null]]);
    expect(viewerOpOf(update, ops, 'stale')).toBeNull();
  });

  it('withholds an update with nothing beside it live, and replays it as the tab’s stale', () => {
    const ops: ViewerOps = new WeakMap();
    expect(viewerOpOf(update, ops, 'drop')).toBeNull();
    expect(viewerOpOf(update, ops, 'stale')).toEqual({
      kind: 'text-document',
      tabId: 't1',
      stale: true,
    });
    expect(viewerOpOf({ kind: 'text-document', update: 'x' }, ops, 'stale')).toBeNull();
  });

  it('passes a tab’s stale and every other op as they are', () => {
    const ops: ViewerOps = new WeakMap();
    const stale = { kind: 'text-document', tabId: 't1', stale: true };
    const other = { kind: 'element-update', tabId: 'c' };
    expect(viewerOpOf(stale, ops, 'drop')).toBe(stale);
    expect(viewerOpOf(other, ops, 'drop')).toBe(other);
    expect(viewerOpOf('ping', ops, 'drop')).toBe('ping');
    expect(viewerOpOf(null, ops, 'drop')).toBeNull();
  });
});
