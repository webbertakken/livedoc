// A sheet changeset's body read (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D262-D264).
import { describe, expect, it } from 'vitest';
import {
  SHEET_CHANGESET_BYTES_MAX,
  SHEET_CHANGESET_CELLS_MAX,
  SHEET_CHANGESET_WRITES_MAX,
} from '@livedoc/api-schema';
import { parseSheetChangeset } from './request';

const write = { kind: 'cells', cells: [{ r: 'rowaa1', c: 'colaa1', i: { n: 1 } }] };
const read = (body: unknown) => parseSheetChangeset(JSON.stringify(body));
const error = (body: unknown) => {
  const r = read(body);
  return r.ok ? null : [r.refused.status, r.refused.body.error];
};

describe('parseSheetChangeset', () => {
  it('reads the writes, a cleaned summary, the revision and strict', () => {
    expect(read({ writes: [write], summary: ' fill\u0007 ', rev: 3, strict: true })).toEqual({
      ok: true,
      value: { writes: [write], summary: 'fill', rev: 3, strict: true },
    });
    expect(read({ writes: [{ kind: 'title', title: 'A' }] })).toMatchObject({
      ok: true,
      value: { summary: null, rev: null, strict: false },
    });
  });

  it('refuses what is not a body of writes', () => {
    expect(parseSheetChangeset('{').ok).toBe(false);
    expect(error([])).toEqual([400, 'invalid_body']);
    expect(error({ writes: 'x' })).toEqual([400, 'invalid_body']);
    expect(error({ writes: [null] })).toEqual([400, 'invalid_body']);
    expect(error({ writes: [write], summary: 3 })).toEqual([400, 'invalid_body']);
    expect(error({ writes: [write], strict: 'yes' })).toEqual([400, 'invalid_body']);
  });

  it('holds a changeset to its caps', () => {
    expect(parseSheetChangeset(' '.repeat(SHEET_CHANGESET_BYTES_MAX + 1)).ok).toBe(false);
    expect(error({ writes: Array(SHEET_CHANGESET_WRITES_MAX + 1).fill(write) })).toEqual([
      413,
      'too_large',
    ]);
    const cells = Array(SHEET_CHANGESET_CELLS_MAX + 1).fill(write.cells[0]);
    expect(error({ writes: [{ kind: 'layout', changes: [], cells }] })).toEqual([413, 'too_large']);
    expect(error({ writes: [write], summary: 'x'.repeat(81) })).toEqual([400, 'invalid_value']);
  });

  it('reads the base', () => {
    expect(error({ writes: [write], rev: -1 })).toEqual([400, 'invalid_base']);
    expect(error({ writes: [write], strict: true })).toEqual([400, 'strict_needs_base']);
  });

  it('counts a layout write with no cells as none', () => {
    expect(read({ writes: [{ kind: 'layout', changes: [] }] }).ok).toBe(true);
  });
});
