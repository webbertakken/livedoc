import { describe, expect, it } from 'vitest';
import { extractJson } from './ai-json';

describe('the JSON in a model’s answer', () => {
  it('is read bare', () => {
    expect(extractJson(' {"lines": []} ')).toEqual({ lines: [] });
  });

  it('is read out of a fence', () => {
    expect(extractJson('```json\n{"lines": ["a"]}\n```')).toEqual({ lines: ['a'] });
  });

  it('is read out of a sentence', () => {
    expect(extractJson('Here you are: {"lines": ["a"]} Anything else?')).toEqual({ lines: ['a'] });
  });

  it('is null when there is none', () => {
    expect(extractJson('I would rather not.')).toBeNull();
    expect(extractJson('```json\n{"lines": [\n```')).toBeNull();
    expect(extractJson('{ not json }')).toBeNull();
  });
});
