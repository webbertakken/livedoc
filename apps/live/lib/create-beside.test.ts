// docs/specs/013-workspace/default-folders.md "Duplicate": a new document filed beside its source, or at the root of
// My Documents when the person may not file there.
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/core';
import { createBeside, EXPLICIT_ROOT, placementOf } from './create-beside';

const beside = { teamId: 'team', folderId: 'folder' };

describe('createBeside', () => {
  it('files beside the source', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    await expect(createBeside(create, beside)).resolves.toBe('beside');
    expect(create).toHaveBeenCalledWith(beside);
  });

  it('files at the root when the place is refused', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('create', 403, 'team_forbidden'))
      .mockResolvedValueOnce(undefined);
    await expect(createBeside(create, beside)).resolves.toBe('root');
    expect(create).toHaveBeenLastCalledWith(EXPLICIT_ROOT);
  });

  it('passes any other failure on', async () => {
    const error = new ApiError('create', 500, null);
    const create = vi.fn().mockRejectedValue(error);
    await expect(createBeside(create, beside)).rejects.toBe(error);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('placementOf', () => {
  it('reads where the source is filed, else the root', async () => {
    expect(await placementOf(async () => ({ teamId: 't', folderId: 'f' }), 'me', 'D')).toEqual({
      teamId: 't',
      folderId: 'f',
    });
    expect(await placementOf(async () => ({}), 'me', 'D')).toEqual(EXPLICIT_ROOT);
    expect(await placementOf(async () => null, 'me', 'D')).toEqual(EXPLICIT_ROOT);
    expect(
      await placementOf(
        async () => {
          throw new Error('offline');
        },
        'me',
        'D',
      ),
    ).toEqual(EXPLICIT_ROOT);
  });
});
