import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseShortcut } from '@/lib/office/shortcut-notation';
import type { ShortcutStatus } from '@/lib/office/shortcut-registry';
import { TEXT_DOCUMENT_SHORTCUTS } from './text-document-shortcuts';

const SPEC = fileURLToPath(
  new URL('../../../../docs/specs/034-text-documents/keyboard-shortcuts.md', import.meta.url),
);

const STATUS: Record<string, ShortcutStatus> = {
  specified: 'specified',
  "the browser's": 'browser',
  'left out (C3)': 'leftOut',
};

// The spec's tables, row by row: group, action, the three platforms' keys, the status.
function specRows() {
  let group = '';
  const rows: { group: string; action: string; keys: Record<string, string>; status: string }[] =
    [];
  for (const line of readFileSync(SPEC, 'utf8').split('\n')) {
    const heading = /^## (.+)/.exec(line);
    if (heading) group = heading[1]!;
    if (!line.startsWith('| ') || line.startsWith('| Action') || line.startsWith('| ---')) continue;
    const [action, pc, mac, chromeos, status] = line
      .slice(2, -2)
      .split(' | ')
      .map((cell) => cell.trim().replace(/^`|`$/g, ''));
    rows.push({
      group,
      action: action!,
      keys: { pc: pc!, mac: mac!, chromeos: chromeos! },
      status: status!.startsWith('built')
        ? 'built'
        : status!.startsWith('on a comment')
          ? 'surface'
          : (STATUS[status!] ?? `unknown: ${status}`),
    });
  }
  return rows;
}

// docs/specs/034-text-documents/keyboard-shortcuts.md: the registry holds exactly the spec's rows.
describe('the text document shortcut registry', () => {
  it("holds exactly the spec's rows, in its order", () => {
    expect(
      TEXT_DOCUMENT_SHORTCUTS.map(({ group, action, keys, status }) => ({
        group,
        action,
        keys,
        status,
      })),
    ).toEqual(specRows());
  });

  it('gives every row an id of its own', () => {
    const ids = TEXT_DOCUMENT_SHORTCUTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('writes every key in the notation', () => {
    for (const row of TEXT_DOCUMENT_SHORTCUTS)
      for (const keys of Object.values(row.keys))
        expect(() => parseShortcut(keys), keys).not.toThrow();
  });
});
