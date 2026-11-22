import { describe, expect, it } from 'vitest';
import { drawnCount } from './drawn-count';

// docs/specs/006-document/document-snapshots.md "An empty document is never asked for".

describe('drawnCount', () => {
  it('counts the elements, and a form as one more', () => {
    expect(drawnCount({ elements: [] })).toBe(0);
    expect(drawnCount({ elements: [{}, {}] })).toBe(2);
    expect(drawnCount({ elements: [], form: { v: 1, heading: 'F', sections: [] } })).toBe(1);
    expect(drawnCount({ elements: [{}], form: { v: 1 } })).toBe(2);
  });

  // docs/specs/035-pdf-documents/live-editing-and-storage.md "The digest": a PDF document is never "empty".
  it('counts a stored file as one thing to draw', () => {
    expect(drawnCount({ elements: [], blob: 'a'.repeat(64) })).toBe(1);
    expect(drawnCount({ elements: [], blob: null })).toBe(0);
  });

  it('reads anything else as nothing to draw', () => {
    expect(drawnCount({})).toBe(0);
    expect(drawnCount({ elements: 'x', form: null })).toBe(0);
    expect(drawnCount({ elements: [], form: [] })).toBe(0);
    expect(drawnCount({ elements: [], form: 'form' })).toBe(0);
  });
});
