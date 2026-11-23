'use client';

// The text document's right side panel (docs/specs/004-interface-design/office-shell.md "Side panels"): the one open, in
// the shell's resizable frame; Line numbers (page-layout.md "Line numbers"), Watermark (page-layout.md "Watermark"),
// Table properties (tables.md "Table properties") or Image options (objects.md "Working with a picture").
import type { Watermark } from '@livedoc/text-documents';
import { OfficePanel } from '@/components/office/OfficePanel';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import {
  IMAGE_OPTIONS_PANEL,
  LINE_NUMBERS_PANEL,
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
import { TextDocumentTablePropertiesPanel } from './TextDocumentTablePropertiesPanel';
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
  };
}) {
  const spec = [
    LINE_NUMBERS_PANEL,
    WATERMARK_PANEL,
    TABLE_PROPERTIES_PANEL,
    IMAGE_OPTIONS_PANEL,
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
      {spec === IMAGE_OPTIONS_PANEL ? (
        <TextDocumentImageOptionsPanel
          picture={imageOptions.picture}
          unit={imageOptions.unit}
          onChange={imageOptions.apply}
          onTurn={imageOptions.turn}
          onReset={imageOptions.reset}
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
