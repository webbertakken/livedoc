// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { closeStartForBlank } from './close-start-for-blank';
import { showStart, startShown } from './start-shown';

// docs/specs/007-editor/start-diagramming.md "Found in other modes": a blank from another mode lands on its canvas.
afterEach(() => localStorage.clear());

describe('closeStartForBlank', () => {
  it('closes the start of a blank in its own mode', () => {
    showStart('t:diagram');
    expect(closeStartForBlank('t', 'blank')).toBe(true);
    expect(startShown('t:diagram')).toBe(false);
    showStart('u:draw');
    expect(closeStartForBlank('u', 'whiteboard')).toBe(true);
    expect(startShown('u:draw')).toBe(false);
  });

  it('leaves a template, a Plan blank and no template alone', () => {
    showStart('t:diagram');
    expect(closeStartForBlank('t', 'flowchart')).toBe(false);
    expect(closeStartForBlank('t', 'blank-plan')).toBe(false);
    expect(closeStartForBlank('t', null)).toBe(false);
    expect(startShown('t:diagram')).toBe(true);
  });
});
