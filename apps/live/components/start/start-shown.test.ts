// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  START_SHOWN_KEY,
  hideStart,
  showStart,
  startKey,
  startShown,
  subscribeStartShown,
} from './start-shown';
import { openStartForModeChoice } from './open-start-for-mode-choice';

// docs/specs/007-editor/start-diagramming.md "When it shows": a start is shown only when asked for.
beforeEach(() => localStorage.clear());

describe('a tab’s start', () => {
  it('is closed until asked for, per tab and mode', () => {
    expect(startShown(startKey('t', 'diagram'))).toBe(false);
    showStart(startKey('t', 'diagram'));
    expect(startShown('t:diagram')).toBe(true);
    expect(startShown('t:draw')).toBe(false);
    expect(startShown('u:diagram')).toBe(false);
  });

  it('closes again, tells its readers, and survives a reload', () => {
    let told = 0;
    const off = subscribeStartShown(() => told++);
    showStart('t:pages');
    expect(localStorage.getItem(START_SHOWN_KEY)).toContain('t:pages');
    hideStart('t:pages');
    expect(startShown('t:pages')).toBe(false);
    expect(told).toBe(2);
    off();
  });
});

describe('openStartForModeChoice', () => {
  it('opens the start of a mode’s blank, in its own mode', () => {
    expect(openStartForModeChoice('t', 'blank')).toBe(true);
    expect(startShown('t:diagram')).toBe(true);
    expect(openStartForModeChoice('u', 'whiteboard')).toBe(true);
    expect(startShown('u:draw')).toBe(true);
    expect(openStartForModeChoice('w', 'blank-session')).toBe(true);
    expect(startShown('w:workshop')).toBe(true);
  });

  it('leaves a template, a Plan blank and no template alone', () => {
    expect(openStartForModeChoice('t', 'flowchart')).toBe(false);
    expect(openStartForModeChoice('t', 'blank-plan')).toBe(false);
    expect(openStartForModeChoice('t', null)).toBe(false);
    expect(startShown('t:diagram')).toBe(false);
  });
});
