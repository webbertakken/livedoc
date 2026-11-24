// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Building blocks": six ready-made stretches of writing put in at the caret,
// chips written as their text; meeting notes of a dated heading, attendees, notes and action items; an email draft's
// table of To, Cc, Bcc and Subject; four trackers with a title row and a names row as header rows; one undo step for
// an Editor, dimmed for anyone else.
import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { ListDefinition, type CellProps, type Style } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  BUILDING_BLOCK_LINE,
  BUILDING_BLOCK_SHADING,
  BUILDING_BLOCK_TITLE_SIZE,
  BUILDING_BLOCK_TRACKERS,
  BUILDING_BLOCKS,
  EMAIL_LABEL_COLOUR,
  buildingBlockActions,
  buildingBlockContent,
  insertBuildingBlock,
  meetingDate,
  type BuildingBlockContext,
} from './text-document-building-blocks';
import { NEW_TABLE_CELL } from './text-document-tables';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const TODAY = new Date(2026, 10, 24);
const context: BuildingBlockContext = {
  width: 468,
  today: TODAY,
  locale: 'en-GB',
  styles: { heading2: 'Heading2', heading3: 'Heading3' },
  lists: { bullet: 'b', check: 'c' },
};

const p = (text: string) => schema.nodes.paragraph!.create(null, text ? [schema.text(text)] : []);
const markValue = (node: PmNode, name: string) =>
  (node.marks.find((m: Mark) => m.type.name === name)?.attrs as { value: unknown } | undefined)
    ?.value;
const cellsOf = (row: PmNode) => row.content.content;
const attrsOf = (node: PmNode) => node.attrs as Record<string, unknown>;
const propsOf = (node: PmNode) => attrsOf(node).props as CellProps;

describe('BUILDING_BLOCKS', () => {
  it('lists Google’s six in its order', () => {
    expect(BUILDING_BLOCKS.map((b) => b.label)).toEqual([
      'Meeting notes',
      'Email draft',
      'Product roadmap',
      'Review tracker',
      'Project assets',
      'Content launch tracker',
    ]);
  });
});

describe('meetingDate', () => {
  it('writes today in the person’s locale, the month abbreviated', () => {
    expect(meetingDate(TODAY, 'en-GB')).toBe('24 Nov 2026');
    expect(meetingDate(TODAY, 'en-US')).toBe('Nov 24, 2026');
  });
});

describe('meeting notes', () => {
  const { nodes, caret } = buildingBlockContent('meeting-notes', context);

  it('is a dated heading, attendees, notes with a bullet and action items with a checklist item', () => {
    expect(
      nodes.map((n): unknown[] => [attrsOf(n).style ?? null, n.textContent, attrsOf(n).list]),
    ).toEqual([
      ['Heading2', '24 Nov 2026 | ', null],
      [null, 'Attendees: ', null],
      ['Heading3', 'Notes', null],
      [null, '', { id: 'b', level: 0 }],
      ['Heading3', 'Action items', null],
      [null, '', { id: 'c', level: 0 }],
    ]);
  });

  it('leaves the caret after the date, for the meeting’s name', () => {
    expect(caret).toEqual({ path: [0], offset: '24 Nov 2026 | '.length });
  });

  it('writes Normal text where the document has no heading style', () => {
    const plain = buildingBlockContent('meeting-notes', {
      ...context,
      styles: { heading2: null, heading3: null },
    });
    expect(plain.nodes[0]!.attrs.style).toBeNull();
  });
});

describe('email draft', () => {
  const { nodes, caret } = buildingBlockContent('email-draft', context);
  const table = nodes[0]!;

  it('is a table of To, Cc, Bcc and Subject with a paragraph after it for the message', () => {
    expect(nodes.map((n) => n.type.name)).toEqual(['table', 'paragraph']);
    expect(table.content.content.map((row) => row.child(0).textContent)).toEqual([
      'To',
      'Cc',
      'Bcc',
      'Subject',
    ]);
    expect(table.content.content.every((row) => row.child(1).textContent === '')).toBe(true);
  });

  it('writes the labels in grey in a quarter of the width, the rest for the values', () => {
    const row = table.child(0);
    expect(markValue(row.child(0).firstChild!.firstChild!, 'color')).toBe(EMAIL_LABEL_COLOUR);
    expect(row.child(0).attrs.colwidth).toEqual([117]);
    expect(row.child(1).attrs.colwidth).toEqual([351]);
    expect(row.child(0).attrs.props).toEqual({ ...NEW_TABLE_CELL, borders: expect.any(Object) });
    expect(propsOf(row.child(0)).borders?.top).toEqual(BUILDING_BLOCK_LINE);
  });

  it('puts the caret in To’s cell', () => {
    expect(caret).toEqual({ path: [0, 0, 1, 0], offset: 0 });
  });
});

describe('trackers', () => {
  it.each(Object.entries(BUILDING_BLOCK_TRACKERS))(
    '%s is a title row, a names row as header rows, then its rows',
    (id, tracker) => {
      const { nodes, caret } = buildingBlockContent(
        id as keyof typeof BUILDING_BLOCK_TRACKERS,
        context,
      );
      expect(nodes).toHaveLength(1);
      const table = nodes[0]!;
      const columns = tracker.columns.length;
      expect(table.childCount).toBe(2 + tracker.rows.length);

      const title = table.child(0);
      expect(title.childCount).toBe(1);
      expect(title.child(0).type.name).toBe('table_header');
      expect(title.child(0).attrs.colspan).toBe(columns);
      expect(propsOf(title.child(0)).background).toBe(BUILDING_BLOCK_SHADING);
      expect(title.textContent).toBe(tracker.title);
      expect(markValue(title.child(0).firstChild!.firstChild!, 'size')).toBe(
        BUILDING_BLOCK_TITLE_SIZE,
      );

      const names = table.child(1);
      expect(cellsOf(names).map((c) => c.type.name)).toEqual(Array(columns).fill('table_header'));
      expect(cellsOf(names).map((c) => c.textContent)).toEqual(tracker.columns);
      expect(markValue(names.child(0).firstChild!.firstChild!, 'bold')).toBe(true);

      for (const [index, row] of tracker.rows.entries()) {
        const cells = cellsOf(table.child(2 + index));
        expect(cells.map((c) => c.type.name)).toEqual(Array(columns).fill('table_cell'));
        expect(cells.map((c) => c.textContent)).toEqual(row);
      }
      // Columns share the width equally.
      const width = Math.round((468 / columns) * 100) / 100;
      expect(cellsOf(names).map((c) => attrsOf(c).colwidth)).toEqual(Array(columns).fill([width]));
      expect(caret.path.slice(0, 2)).toEqual([0, 2]);
      expect(tracker.rows[0]![caret.path[2]!]).toBe('');
    },
  );

  it('writes each tracker’s columns and statuses as Google’s', () => {
    expect(BUILDING_BLOCK_TRACKERS['product-roadmap'].columns).toEqual([
      'Project',
      'Status',
      'Related files',
      'Notes',
    ]);
    expect(BUILDING_BLOCK_TRACKERS['review-tracker'].rows.map((r) => r[1])).toEqual([
      'Not started',
      'In progress',
      'Under review',
      'Approved',
    ]);
    expect(BUILDING_BLOCK_TRACKERS['content-launch-tracker'].columns).toEqual([
      'Type',
      'Description',
      'Date',
      'Published',
      'Outlet',
    ]);
  });
});

describe('insertBuildingBlock', () => {
  it('puts the block in at the caret and the caret where the block asks', () => {
    const doc = schema.node('doc', null, [p('abcd')]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 5) });
    let next = state;
    const content = buildingBlockContent('meeting-notes', context);
    expect(insertBuildingBlock(content)(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(next.doc.child(0).textContent).toBe('abcd');
    expect(next.doc.child(1).textContent).toBe('24 Nov 2026 | ');
    expect(next.selection.$from.parent).toBe(next.doc.child(1));
    expect(next.selection.$from.parentOffset).toBe('24 Nov 2026 | '.length);
  });

  it('puts the caret into a tracker’s first empty cell', () => {
    const doc = schema.node('doc', null, [p('')]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
    let next = state;
    insertBuildingBlock(buildingBlockContent('review-tracker', context))(
      state,
      (tr) => (next = state.apply(tr)),
    );
    const $caret = next.selection.$from;
    // The paragraph's cell, row and table, from the caret up.
    expect($caret.node($caret.depth - 1).type.name).toBe('table_cell');
    expect($caret.index($caret.depth - 3)).toBe(2);
    expect($caret.index($caret.depth - 2)).toBe(0);
  });
});

describe('buildingBlockActions', () => {
  function editor(doc = schema.node('doc', null, [p('ab')])) {
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, selection: TextSelection.create(doc, 3) }),
    });
    const styles: Style[] = [];
    const lists: Record<string, ListDefinition> = { l1: ListDefinition.of('number') };
    const deps = {
      view,
      canEdit: true,
      width: 468,
      format: 'ooxml' as const,
      readStyles: () => styles,
      addStyle: vi.fn((style: Style) => styles.push(style)),
      lists: {
        read: () => lists,
        set: vi.fn((id: string, list: ListDefinition) => (lists[id] = list)),
      },
      now: () => TODAY,
      locale: 'en-GB',
    };
    return { view, deps, lists };
  }

  it('has an action per block for an Editor, and none for anyone else', () => {
    const { deps } = editor();
    expect(Object.keys(buildingBlockActions(deps))).toEqual(BUILDING_BLOCKS.map((b) => b.item));
    expect(buildingBlockActions({ ...deps, canEdit: false })).toEqual({});
    expect(buildingBlockActions({ ...deps, view: null })).toEqual({});
  });

  it('adds the heading styles the document lacks and two new lists, and counts the block', () => {
    const { view, deps, lists } = editor();
    buildingBlockActions(deps)['building-block-meeting-notes']!.run();
    expect(deps.addStyle.mock.calls.map(([s]) => s.role)).toEqual(['heading2', 'heading3']);
    const added = Object.keys(lists).filter((id) => id !== 'l1');
    expect(added.map((id) => ListDefinition.kindAt(lists[id], 0))).toEqual(['bullet', 'check']);
    expect(view.state.doc.child(1).textContent).toBe('24 Nov 2026 | ');
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentBuildingBlockMeetingNotes');
    view.destroy();
  });

  it('starts no list for a tracker', () => {
    const { view, deps } = editor();
    buildingBlockActions(deps)['building-block-project-assets']!.run();
    expect(deps.lists.set).not.toHaveBeenCalled();
    expect(view.state.doc.child(1).type.name).toBe('table');
    expect(track).toHaveBeenCalledWith(
      'Element',
      'Added',
      'TextDocumentBuildingBlockProjectAssets',
    );
    view.destroy();
  });
});
