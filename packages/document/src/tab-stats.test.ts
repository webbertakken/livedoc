import { describe, expect, it } from 'vitest';
import { tabStatsOf } from './tab-stats';

// docs/specs/013-workspace/explorer-details-view.md "Where the numbers come from".

const thread = (n: number, resolved = false) => ({
  resolved,
  comments: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, text: 'hi' })),
});

describe('tabStatsOf', () => {
  it('counts elements, every comment and the stored bytes, in the tab mode', () => {
    const body = {
      opensIn: 'draw',
      elements: [
        { id: 'a', type: 'shape', commentThread: thread(2) },
        { id: 'b', type: 'shape', commentThread: thread(1, true) },
        { id: 'c', type: 'shape' },
      ],
    };
    const data = JSON.stringify(body);
    expect(tabStatsOf(body, data)).toEqual({
      mode: 'draw',
      elementCount: 3,
      commentCount: 3,
      dataBytes: new TextEncoder().encode(data).length,
    });
  });

  // docs/specs/035-pdf-documents/live-editing-and-storage.md "The digest": a PDF tab's size is its stored file's.
  it('counts a PDF tab’s stored file in its bytes', () => {
    const body = { kind: 'pdf', elements: [], blob: 'a'.repeat(64), size: 2_500_000 };
    const data = JSON.stringify(body);
    expect(tabStatsOf(body, data)).toEqual({
      mode: 'diagram',
      elementCount: 0,
      commentCount: 0,
      dataBytes: data.length + 2_500_000,
    });
    // A tab that names no file a store could hold counts its row alone.
    expect(tabStatsOf({ ...body, blob: 'nope' }, data).dataBytes).toBe(data.length);
    expect(tabStatsOf({ ...body, kind: 'diagram' }, data).dataBytes).toBe(data.length);
  });

  it('measures bytes, not characters', () => {
    const data = JSON.stringify({ elements: [], note: 'héé' });
    expect(tabStatsOf({ elements: [] }, data).dataBytes).toBe(data.length + 2);
  });

  it('reads Diagram for a tab with no mode, an event-storming board and a legacy mode as today', () => {
    expect(tabStatsOf({ elements: [] }, '{}').mode).toBe('diagram');
    expect(tabStatsOf({ kind: 'event-storming', opensIn: 'draw', elements: [] }, '{}').mode).toBe(
      'diagram',
    );
    expect(tabStatsOf({ opensIn: 'infographic', elements: [] }, '{}').mode).toBe('pages');
  });

  it('counts a body without an elements array as empty', () => {
    expect(tabStatsOf({}, '{}')).toMatchObject({ elementCount: 0, commentCount: 0 });
  });
});
