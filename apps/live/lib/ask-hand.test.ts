import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ES_ASK_HAND_KEY, readAskHand, writeAskHand } from './ask-hand';

describe('the hand last used for an ask', () => {
  let stored: Map<string, string>;
  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => void stored.set(key, value),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is the CLI the first time, and for anything else that was stored', () => {
    expect(readAskHand()).toBe('cli');
    stored.set(ES_ASK_HAND_KEY, 'a pigeon');
    expect(readAskHand()).toBe('cli');
  });

  it('is remembered on this device', () => {
    writeAskHand('built-in');
    expect(stored.get(ES_ASK_HAND_KEY)).toBe('built-in');
    expect(readAskHand()).toBe('built-in');
  });
});
