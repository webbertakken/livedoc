'use client';

// The text document's right side panel (docs/specs/004-interface-design/office-shell.md "Side panels"): the one open, in
// the shell's resizable frame; Line numbers (page-layout.md "Line numbers"), Watermark (page-layout.md "Watermark"),
// Table properties (tables.md "Table properties"), Image options (objects.md "Working with a picture") or Table of
// contents (links-and-navigation.md "Table of contents").
import type { ContentsLook, Watermark } from '@livedoc/text-documents';
import { OfficePanel } from '@/components/office/OfficePanel';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import {
  IMAGE_OPTIONS_PANEL,
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
import type { LineNumbersState } from './useTextDocumentLineNumbers';

export function TextDocumentRightPanel({
  panels,
  lineNumbers,
  watermark,
  tableProperties,
  imageOptions,
  contents,
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
}) {
  const spec = [
    LINE_NUMBERS_PANEL,
    WATERMARK_PANEL,
    TABLE_PROPERTIES_PANEL,
    IMAGE_OPTIONS_PANEL,
    TABLE_OF_CONTENTS_PANEL,
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
      {spec === TABLE_OF_CONTENTS_PANEL ? (
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
