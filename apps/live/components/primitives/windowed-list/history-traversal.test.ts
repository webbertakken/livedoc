// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetHistoryTraversal,
  takeHistoryTraversal,
  watchHistoryTraversal,
} from './history-traversal';

describe('history traversal', () => {
  beforeEach(() => {
    resetHistoryTraversal();
    watchHistoryTraversal();
  });

  it('says a list was reached by Back or Forward once, for the address it landed on', () => {
    window.history.pushState({}, '', '/explorer/folder?id=a');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(takeHistoryTraversal('/explorer/folder?id=b')).toBe(false);
    expect(takeHistoryTraversal('/explorer/folder?id=a')).toBe(true);
    expect(takeHistoryTraversal('/explorer/folder?id=a')).toBe(false);
  });

  it('says nothing for a list opened by a link', () => {
    window.history.pushState({}, '', '/explorer/folder?id=a');
    expect(takeHistoryTraversal('/explorer/folder?id=a')).toBe(false);
  });
});
