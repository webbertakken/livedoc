import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  agreement,
  openedFixture,
  PAGE_START_FIXTURES,
  previewStartKeys,
} from '../testing/page-start-fixtures';

// docs/specs/034-text-documents/agents-and-sync.md "Page previews", the agreement measure: the editor's page starts,
// recorded by apps/live/e2e/office/text-document-page-starts.spec.ts, against the previews'. The previews' starts
// must be the ones recorded with them (a change to the layout records them again), and the share of pages starting
// on the same block never falls below the share recorded.

type Recorded = {
  fixtures: Record<string, { editor: string[]; preview: string[] }>;
  agreement: { pages: number; same: number };
};

const RECORDED: Recorded = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../corpus/page-starts.json'), 'utf8'),
) as Recorded;

describe('the page previews’ agreement with the editor', () => {
  it('records every fixture', () => {
    expect(Object.keys(RECORDED.fixtures).sort()).toEqual(Object.keys(PAGE_START_FIXTURES).sort());
  });

  for (const [name, make] of Object.entries(PAGE_START_FIXTURES))
    it(`lays ${name} out onto the pages recorded`, async () => {
      const { document } = await openedFixture(make);
      expect(previewStartKeys(document)).toEqual(RECORDED.fixtures[name]!.preview);
    });

  it('holds the share of pages that start on the same block', () => {
    const total = Object.values(RECORDED.fixtures).reduce(
      (sum, { editor, preview }) => {
        const each = agreement(editor, preview);
        return { pages: sum.pages + each.pages, same: sum.same + each.same };
      },
      { pages: 0, same: 0 },
    );
    expect(total).toEqual(RECORDED.agreement);
    console.info(
      `[page-starts] ${total.same} of ${total.pages} pages start on the same block (${Math.round((100 * total.same) / total.pages)}%)`,
    );
  });
});
