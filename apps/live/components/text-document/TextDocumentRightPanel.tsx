'use client';

// The text document's right side panel (docs/specs/004-interface-design/office-shell.md "Side panels"): the one open, in
// the shell's resizable frame; Line numbers (page-layout.md "Line numbers"), Watermark (page-layout.md "Watermark"),
// Table properties (tables.md "Table properties"), Image options (objects.md "Working with a picture") or Table of
// contents (links-and-navigation.md "Table of contents"), or Comments (review.md "The comments panel").
import type { ContentsLook, Watermark } from '@livedoc/text-documents';
import { OfficePanel } from '@/components/office/OfficePanel';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import { OfficeCommentsPanel } from '@/components/office/review/OfficeCommentsPanel';
import { commentNoteOf } from '@/lib/text-document/text-document-comment-rows';
import type { ReviewSelf } from '@/lib/office/review/comment-filters';
import type { TextDocumentCommentsPanel } from './useTextDocumentCommentsPanel';
import {
  COMMENTS_PANEL,
  IMAGE_OPTIONS_PANEL,
  LIVE_EDITS_PANEL,
  LINE_NUMBERS_PANEL,
  TABLE_OF_CONTENTS_PANEL,
  TABLE_PROPERTIES_PANEL,
  WATERMARK_PANEL,
} from '@/lib/text-document/text-document-panels';
import type {
  TableProperties,
  TablePropertyChange,
} from '@/lib/text-document/text-document-table-properties';
import type { IndentUnit } from '@/lib/text-document/indent-units';
import type { PictureSizeChange } from '@/lib/text-document/text-document-picture-size';
import {
  TextDocumentImageOptionsPanel,
  type PictureSizing,
  type PictureTurn,
} from './TextDocumentImageOptionsPanel';
import type { PictureColoursChange } from '@/lib/text-document/text-document-picture-edit';
import type { PicturePlacingControls } from './useTextDocumentPicturePlacing';
import { TextDocumentTablePropertiesPanel } from './TextDocumentTablePropertiesPanel';
import { TextDocumentContentsPanel } from './TextDocumentContentsPanel';
import type { ContentsChange } from '@/lib/text-document/text-document-contents-build';
import type { LineNumbersChoice } from '@/lib/text-document/text-document-line-numbers';
import { TextDocumentLineNumbersPanel } from './TextDocumentLineNumbersPanel';
import { TextDocumentWatermarkPanel } from './TextDocumentWatermarkPanel';
import { TextDocumentLiveEditsPanel } from './TextDocumentLiveEditsPanel';
import type { LiveEdit } from '@/lib/text-document/text-document-live-edits';
import type { LineNumbersState } from './useTextDocumentLineNumbers';

// How a comment is added, said in the comments panel when there are none (review.md, default copy).
const addHint = (): string =>
  `Select some text and press ${currentOfficePlatform().platform === 'mac' ? '⌘⌥M' : 'Ctrl+Alt+M'} to comment.`;

export function TextDocumentRightPanel({
  panels,
  lineNumbers,
  watermark,
  tableProperties,
  imageOptions,
  contents,
  comments,
  liveEdits,
}: {
  panels: OfficePanelsState;
  lineNumbers: {
    state: LineNumbersState;
    choose: (choice: Omit<LineNumbersChoice, 'section'>) => void;
  };
  watermark: { watermark: Watermark | undefined; apply: (next: Watermark | undefined) => void };
  tableProperties: {
    properties: TableProperties | null;
    unit: IndentUnit;
    apply: (change: TablePropertyChange) => void;
  };
  imageOptions: {
    picture: PictureSizing | null;
    unit: IndentUnit;
    apply: (change: PictureSizeChange, lock: boolean) => void;
    turn: (turn: PictureTurn) => void;
    reset: () => void;
    colour: (change: PictureColoursChange) => void;
    placing: PicturePlacingControls;
  };
  contents: {
    selected: { look: ContentsLook; levels: number } | null;
    change: (change: ContentsChange) => void;
  };
  comments: TextDocumentCommentsPanel & {
    self: ReviewSelf;
    canComment: boolean;
    go: (id: string) => void;
    reopen: (id: string) => void;
  };
  liveEdits: { entries: readonly LiveEdit[]; said: string };
}) {
  const spec = [
    LINE_NUMBERS_PANEL,
    WATERMARK_PANEL,
    TABLE_PROPERTIES_PANEL,
    IMAGE_OPTIONS_PANEL,
    TABLE_OF_CONTENTS_PANEL,
    COMMENTS_PANEL,
    LIVE_EDITS_PANEL,
  ].find((p) => p.id === panels.open.right);
  if (!spec) return null;
  return (
    <OfficePanel
      spec={spec}
      width={panels.width}
      onWidth={panels.setWidth}
      onWidthDone={panels.saveWidth}
      onClose={() => panels.close('right')}
      focusNonce={panels.focusNonce}
    >
      {spec === LIVE_EDITS_PANEL ? (
        <TextDocumentLiveEditsPanel entries={liveEdits.entries} said={liveEdits.said} />
      ) : spec === COMMENTS_PANEL ? (
        <OfficeCommentsPanel
          rows={comments.rows}
          groups={comments.groups}
          self={comments.self}
          canComment={comments.canComment}
          filters={comments.filters}
          onFilters={comments.setFilters}
          onGo={comments.go}
          onReopen={comments.reopen}
          addHint={addHint()}
          noteOf={commentNoteOf}
        />
      ) : spec === TABLE_OF_CONTENTS_PANEL ? (
        <TextDocumentContentsPanel selected={contents.selected} onChange={contents.change} />
      ) : spec === IMAGE_OPTIONS_PANEL ? (
        <TextDocumentImageOptionsPanel
          picture={imageOptions.picture}
          unit={imageOptions.unit}
          onChange={imageOptions.apply}
          onTurn={imageOptions.turn}
          onReset={imageOptions.reset}
          onColour={imageOptions.colour}
          placing={imageOptions.placing}
        />
      ) : spec === TABLE_PROPERTIES_PANEL ? (
        <TextDocumentTablePropertiesPanel
          properties={tableProperties.properties}
          unit={tableProperties.unit}
          onChange={tableProperties.apply}
        />
      ) : spec === LINE_NUMBERS_PANEL ? (
        <TextDocumentLineNumbersPanel state={lineNumbers.state} onChoose={lineNumbers.choose} />
      ) : (
        <TextDocumentWatermarkPanel
          watermark={watermark.watermark}
          onApply={watermark.apply}
          onDone={() => panels.close('right')}
        />
      )}
    </OfficePanel>
  );
}
