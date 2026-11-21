import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIND_FAMILY_IDS } from './families';
import { loadEveryKindFamily } from './load-every-family';
import { isKindFamilyLoaded } from './store';

// docs/specs/003-system-architecture/testing.md "A test never pays a cold module load".
describe('loadEveryKindFamily', () => {
  it('imports every family statically, so no load is cold inside a hook', () => {
    const source = readFileSync(new URL('./load-every-family.ts', import.meta.url), 'utf8');
    const missing = KIND_FAMILY_IDS.filter((id) => !source.includes(`import './families/${id}';`));
    expect(missing).toEqual([]);
  });

  it('loads every family', async () => {
    await loadEveryKindFamily();
    expect(KIND_FAMILY_IDS.filter((id) => !isKindFamilyLoaded(id))).toEqual([]);
  });
});
