import { describe, expect, it } from 'vitest';
import { fakeIo } from '../testing/fake-io';
import type { LinkFile } from './link-file';
import { mirrorTree } from './mirror-tree';

// docs/specs/027-repositories/repository-link.md: writes stay inside the mirror
// directory.
const link: LinkFile = {
  path: '/work/livedoc.toml',
  root: '/work',
  host: null,
  covers: { folder: null, documents: [] },
  mirror: { level: 'files', dir: 'diagrams' },
  hooks: { block: false },
  sources: [],
};

describe('mirrorTree writes', () => {
  it('writes a path below the mirror directory, existing folders or not', async () => {
    const io = fakeIo({ files: { '/work/diagrams/INDEX.md': 'x' } });
    const tree = mirrorTree(io, link);
    await tree.write('home.livedoc.json', '{}');
    await tree.write('screens/deep/home.livedoc.json', '{}');
    expect(io.fileMap.get('/work/diagrams/home.livedoc.json')?.data).toBe('{}');
    expect(io.fileMap.get('/work/diagrams/screens/deep/home.livedoc.json')?.data).toBe('{}');
  });

  it('refuses a path that was never below the mirror directory', async () => {
    const io = fakeIo({ files: { '/work/diagrams/INDEX.md': 'x' } });
    const tree = mirrorTree(io, link);
    await expect(tree.write('../elsewhere/x.livedoc.json', '{}')).rejects.toMatchObject({
      failure: { code: 'invalid_dir' },
    });
    await expect(tree.write('../../etc/x.livedoc.json', '{}')).rejects.toMatchObject({
      failure: { code: 'invalid_dir' },
    });
    expect(io.fileMap.has('/work/elsewhere/x.livedoc.json')).toBe(false);
    expect(io.fileMap.has('/etc/x.livedoc.json')).toBe(false);
  });
});
