import { afterEach, describe, expect, it } from 'vitest';
import {
  closeAnswer,
  openAnswer,
  resetStructureViewForTests,
  structureViewFor,
} from './structure-view';

// Which hotspot one person has open for answering (docs/specs/021-event-storming/board-structure.md "Hotspot
// answers"): one at a time, the person's own, and closed whenever another board is looked at.
afterEach(resetStructureViewForTests);

describe('the structure view', () => {
  it('has no answer open to begin with', () => {
    expect(structureViewFor('t').answeringId).toBeNull();
  });

  it('opens one hotspot for answering, and the next takes its place', () => {
    openAnswer('t', 'why');
    expect(structureViewFor('t').answeringId).toBe('why');
    openAnswer('t', 'who');
    expect(structureViewFor('t').answeringId).toBe('who');
  });

  it('closes it', () => {
    openAnswer('t', 'why');
    closeAnswer('t');
    expect(structureViewFor('t').answeringId).toBeNull();
  });

  it('is closed on any other board', () => {
    openAnswer('t', 'why');
    expect(structureViewFor('other').answeringId).toBeNull();
  });

  it('leaves another board’s open answer alone when asked to close this one', () => {
    openAnswer('t', 'why');
    closeAnswer('other');
    expect(structureViewFor('t').answeringId).toBe('why');
  });
});
