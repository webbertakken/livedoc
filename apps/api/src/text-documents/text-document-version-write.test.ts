import { describe, expect, it } from 'vitest';
import { parseTextDocumentVersionWrite } from './text-document-version-write';

const by = { key: 'k', name: 'Ada', color: '#1a73e8' };
const place = { documentId: 'D', tabId: 't1' };

describe('parseTextDocumentVersionWrite', () => {
  it('reads each write', () => {
    expect(
      parseTextDocumentVersionWrite({ ...place, action: 'name', versionId: 'v1', name: 'A', by }),
    ).toEqual({
      ...place,
      action: 'name',
      versionId: 'v1',
      name: 'A',
      by,
    });
    expect(
      parseTextDocumentVersionWrite({ ...place, action: 'name-current', name: null, by }),
    ).toMatchObject({
      action: 'name-current',
      name: null,
    });
    expect(
      parseTextDocumentVersionWrite({ ...place, action: 'restore', versionId: 'v1', by }),
    ).toMatchObject({
      action: 'restore',
    });
  });

  it('refuses what is malformed', () => {
    expect(parseTextDocumentVersionWrite(null)).toBeNull();
    expect(parseTextDocumentVersionWrite({ ...place, action: 'restore', by })).toBeNull();
    expect(
      parseTextDocumentVersionWrite({ ...place, action: 'name', versionId: 'v1', by }),
    ).toBeNull();
    expect(
      parseTextDocumentVersionWrite({ ...place, action: 'drop', versionId: 'v1', by }),
    ).toBeNull();
    expect(parseTextDocumentVersionWrite({ action: 'restore', versionId: 'v1', by })).toBeNull();
    expect(
      parseTextDocumentVersionWrite({
        ...place,
        action: 'restore',
        versionId: 'v1',
        by: { key: 1 },
      }),
    ).toBeNull();
  });
});
