// Insert > Building blocks (docs/specs/034-text-documents/objects.md "Building blocks"): Google's six ready-made
// stretches of writing, each chip written as its text (C3): meeting notes, an email draft, and four trackers that are
// also Google's table templates. Each goes in at the caret as a table does, as one undo step, for an Editor.
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { TextSelection, type Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  ListDefinition,
  type BorderLine,
  type CellProps,
  type ListPlace,
  type Style,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { offsetInside, placeBlocks } from './text-document-block-place';
import type { ListsAccess } from './text-document-lists';
import { ensureRoleStyle } from './text-document-paragraph-styles';
import { textDocumentSchema as schema } from './text-document-schema';
import { NEW_TABLE_CELL, tableWidthAt } from './text-document-tables';
import { startUndoStep } from './text-document-undo';

export type TrackerId =
  'product-roadmap' | 'review-tracker' | 'project-assets' | 'content-launch-tracker';
export type BuildingBlockId = 'meeting-notes' | 'email-draft' | TrackerId;

/** The menu's blocks in Google's order: the menu item, its words and its telemetry type. */
export const BUILDING_BLOCKS: readonly {
  readonly id: BuildingBlockId;
  readonly item: string;
  readonly label: string;
  readonly type: string;
}[] = [
  ['meeting-notes', 'Meeting notes', 'MeetingNotes'],
  ['email-draft', 'Email draft', 'EmailDraft'],
  ['product-roadmap', 'Product roadmap', 'ProductRoadmap'],
  ['review-tracker', 'Review tracker', 'ReviewTracker'],
  ['project-assets', 'Project assets', 'ProjectAssets'],
  ['content-launch-tracker', 'Content launch tracker', 'ContentLaunchTracker'],
].map(([id, label, type]) => ({
  id: id as BuildingBlockId,
  item: `building-block-${id}`,
  label: label!,
  type: `TextDocumentBuildingBlock${type}`,
}));

/** A tracker: its title, its columns' names and its rows, a chip written as its text (default, until captures). */
export type Tracker = {
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

const statusRows = (columns: number, status: number, statuses: readonly string[]) =>
  statuses.map((text) => Array.from({ length: columns }, (_, i) => (i === status ? text : '')));

const REVIEW_STATUSES = ['Not started', 'In progress', 'Under review', 'Approved'];

/** Google's four trackers, shared with Insert > Table > Table templates (tables.md "Inserting"). */
export const BUILDING_BLOCK_TRACKERS: Readonly<Record<TrackerId, Tracker>> = {
  'product-roadmap': {
    title: 'Product roadmap',
    columns: ['Project', 'Status', 'Related files', 'Notes'],
    rows: statusRows(4, 1, ['Not started', 'In progress', 'Launched']),
  },
  'review-tracker': {
    title: 'Review tracker',
    columns: ['Reviewer', 'Status', 'Notes'],
    rows: statusRows(3, 1, REVIEW_STATUSES),
  },
  'project-assets': {
    title: 'Project assets',
    columns: ['File', 'Description', 'Status'],
    rows: statusRows(3, 2, REVIEW_STATUSES),
  },
  'content-launch-tracker': {
    title: 'Content launch tracker',
    columns: ['Type', 'Description', 'Date', 'Published', 'Outlet'],
    rows: statusRows(5, 3, ['No', 'Yes']),
  },
};

/** A block's tables are lined in Google's light grey (default). */
export const BUILDING_BLOCK_LINE: BorderLine = {
  width: 1,
  dash: 'solid',
  color: '#dadce0',
  space: 0,
};
/** The shading of a tracker's title and names rows (default). */
export const BUILDING_BLOCK_SHADING = '#f3f3f3';
/** A tracker's title, in points (default). */
export const BUILDING_BLOCK_TITLE_SIZE = 14;
/** The email draft's labels' grey (default). */
export const EMAIL_LABEL_COLOUR = '#5f6368';
/** The share of the width the email draft's labels take (default). */
export const EMAIL_LABEL_SHARE = 0.25;

const CELL: CellProps = {
  ...NEW_TABLE_CELL,
  borders: {
    top: BUILDING_BLOCK_LINE,
    bottom: BUILDING_BLOCK_LINE,
    left: BUILDING_BLOCK_LINE,
    right: BUILDING_BLOCK_LINE,
  },
};
const SHADED: CellProps = { ...CELL, background: BUILDING_BLOCK_SHADING };

/** What a block is made in: the text width, today, and the document's styles and new lists to use. */
export type BuildingBlockContext = {
  /** Points: the width a table at the caret takes. */
  readonly width: number;
  readonly today: Date;
  /** The person's locale; the browser's when absent. */
  readonly locale?: string;
  /** Style ids, null where the paragraph is Normal text. */
  readonly styles: { readonly heading2: string | null; readonly heading3: string | null };
  /** New lists' ids: the notes' bullets and the action items' checklist. */
  readonly lists: { readonly bullet: string; readonly check: string };
};

/** What goes in, and where the caret goes in it: a node at each depth to a text block, and characters into it. */
export type BuildingBlockContent = {
  readonly nodes: readonly PmNode[];
  readonly caret: { readonly path: readonly number[]; readonly offset: number };
};

/** Today as Google's date chip shows it: the person's locale, the month abbreviated. */
export const meetingDate = (today: Date, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    today,
  );

const round = (value: number) => Math.round(value * 100) / 100;

const text = (value: string, marks: readonly Mark[] = []) =>
  value ? [schema.text(value, marks)] : [];

const paragraph = (
  value: string,
  {
    style = null,
    list = null,
    marks = [],
  }: { style?: string | null; list?: ListPlace | null; marks?: Mark[] } = {},
) => schema.nodes.paragraph!.create({ style, list }, text(value, marks));

const cell = (
  value: string,
  {
    header = false,
    props = CELL,
    widths,
    marks = [],
  }: {
    header?: boolean;
    props?: CellProps;
    widths: number[];
    marks?: Mark[];
  },
) =>
  (header ? schema.nodes.table_header! : schema.nodes.table_cell!).create(
    { colspan: widths.length, rowspan: 1, colwidth: widths, props },
    paragraph(value, { marks }),
  );

const row = (cells: PmNode[]) => schema.nodes.table_row!.create(null, cells);

const mark = (name: string, value: unknown) => schema.marks[name]!.create({ value });

function meetingNotes({
  today,
  locale,
  styles,
  lists,
}: BuildingBlockContext): BuildingBlockContent {
  const heading = `${meetingDate(today, locale)} | `;
  return {
    nodes: [
      paragraph(heading, { style: styles.heading2 }),
      paragraph('Attendees: '),
      paragraph('Notes', { style: styles.heading3 }),
      paragraph('', { list: { id: lists.bullet, level: 0 } }),
      paragraph('Action items', { style: styles.heading3 }),
      paragraph('', { list: { id: lists.check, level: 0 } }),
    ],
    caret: { path: [0], offset: heading.length },
  };
}

function emailDraft({ width }: BuildingBlockContext): BuildingBlockContent {
  const label = round(width * EMAIL_LABEL_SHARE);
  const value = round(width - label);
  const grey = [mark('color', EMAIL_LABEL_COLOUR)];
  const rows = ['To', 'Cc', 'Bcc', 'Subject'].map((name) =>
    row([cell(name, { widths: [label], marks: grey }), cell('', { widths: [value] })]),
  );
  return {
    nodes: [schema.nodes.table!.create(null, rows), paragraph('')],
    caret: { path: [0, 0, 1, 0], offset: 0 },
  };
}

/** A tracker's table at `width`: its title and names as header rows, its columns sharing the width equally. */
export function trackerTable(
  { title, columns, rows }: Tracker,
  width: number,
): BuildingBlockContent {
  const column = round(width / columns.length);
  const widths = columns.map(() => column);
  const bold = [mark('bold', true)];
  const table = schema.nodes.table!.create(null, [
    row([
      cell(title, {
        header: true,
        props: SHADED,
        widths,
        marks: [mark('size', BUILDING_BLOCK_TITLE_SIZE)],
      }),
    ]),
    row(
      columns.map((name) =>
        cell(name, { header: true, props: SHADED, widths: [column], marks: bold }),
      ),
    ),
    ...rows.map((values) => row(values.map((value) => cell(value, { widths: [column] })))),
  ]);
  const empty = Math.max(0, rows[0]?.indexOf('') ?? 0);
  return { nodes: [table], caret: { path: [0, 2, empty, 0], offset: 0 } };
}

/** The block's nodes and caret, made in `context`. */
export function buildingBlockContent(
  id: BuildingBlockId,
  context: BuildingBlockContext,
): BuildingBlockContent {
  if (id === 'meeting-notes') return meetingNotes(context);
  if (id === 'email-draft') return emailDraft(context);
  return trackerTable(BUILDING_BLOCK_TRACKERS[id], context.width);
}

/** Puts a block's content in at the caret (as a table goes in) and the caret where the block asks. */
export const insertBuildingBlock =
  ({ nodes, caret }: BuildingBlockContent): Command =>
  (state, dispatch) => {
    const tr = state.tr;
    const at = placeBlocks(tr, nodes);
    if (at === null) return false;
    tr.setSelection(
      TextSelection.create(tr.doc, at + offsetInside(nodes, caret.path, caret.offset)),
    );
    dispatch?.(tr.scrollIntoView());
    return true;
  };

/** What Insert > Building blocks needs of the document and the person. */
export type BuildingBlockDeps = {
  view: EditorView | null;
  canEdit: boolean;
  /** Points: the caret's section's text width (a cell's own, less its padding, inside a table). */
  width: number;
  format: TextDocumentFormat;
  readStyles: () => readonly Style[];
  addStyle: (style: Style) => void;
  lists: ListsAccess;
  now?: () => Date;
  locale?: string;
};

/** Insert > Building blocks' items, for whoever may edit the body; nothing for anyone else (dimmed). */
export function buildingBlockActions(deps: BuildingBlockDeps): OfficeActions {
  const { view, canEdit } = deps;
  if (!view || !canEdit) return {};
  const insert = (id: BuildingBlockId, type: string) => {
    if (view.isDestroyed) return;
    const notes = id === 'meeting-notes';
    // Styles and lists only the meeting notes use, made as the block goes in.
    const style = (role: 'heading2' | 'heading3') =>
      notes
        ? ensureRoleStyle(role, {
            styles: deps.readStyles(),
            format: deps.format,
            add: deps.addStyle,
          })
        : null;
    // A step of its own: the writing before it and after it undo apart.
    startUndoStep(view);
    const styles = { heading2: style('heading2'), heading3: style('heading3') };
    const taken = Object.keys(deps.lists.read());
    const bullet = ListDefinition.newId(taken);
    const check = ListDefinition.newId([...taken, bullet]);
    const content = buildingBlockContent(id, {
      width: tableWidthAt(view.state, deps.width),
      today: deps.now?.() ?? new Date(),
      locale: deps.locale,
      styles,
      lists: { bullet, check },
    });
    const command = insertBuildingBlock(content);
    if (!command(view.state)) {
      // The caret is in no writing (a picture or a table selected whole): nothing goes in.
      debugLog('[text-document] building block refused', { block: id });
      return;
    }
    if (notes) {
      deps.lists.set(bullet, ListDefinition.of('bullet'));
      deps.lists.set(check, ListDefinition.of('check'));
    }
    command(view.state, view.dispatch);
    startUndoStep(view);
    track('Element', 'Added', type);
    debugLog('[text-document] building block', { block: id });
    view.focus();
  };
  return Object.fromEntries(
    BUILDING_BLOCKS.map(({ id, item, type }) => [item, { run: () => insert(id, type) }]),
  );
}
