// docs/specs/034-text-documents/objects.md "Where the bytes live": a download names the pictures it left out.
import { describe, expect, it } from 'vitest';
import { leftOutNotice } from './text-document-download';

describe('leftOutNotice', () => {
  it('counts the pictures a file left out', () => {
    expect(leftOutNotice(1)).toBe(
      'The file was downloaded without 1 picture LiveDoc could not read.',
    );
    expect(leftOutNotice(3)).toBe(
      'The file was downloaded without 3 pictures LiveDoc could not read.',
    );
  });
});
