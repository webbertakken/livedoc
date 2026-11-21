'use client';

// The text document's right side panel (docs/specs/004-interface-design/office-shell.md "Side panels"): the one open, in
// the shell's resizable frame; Line numbers (page-layout.md "Line numbers") or Watermark (page-layout.md "Watermark").
import type { Watermark } from '@livedoc/text-documents';
import { OfficePanel } from '@/components/office/OfficePanel';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import { LINE_NUMBERS_PANEL, WATERMARK_PANEL } from '@/lib/text-document/text-document-panels';
import type { LineNumbersChoice } from '@/lib/text-document/text-document-line-numbers';
import { TextDocumentLineNumbersPanel } from './TextDocumentLineNumbersPanel';
import { TextDocumentWatermarkPanel } from './TextDocumentWatermarkPanel';
import type { LineNumbersState } from './useTextDocumentLineNumbers';

export function TextDocumentRightPanel({
  panels,
  lineNumbers,
  watermark,
}: {
  panels: OfficePanelsState;
  lineNumbers: {
    state: LineNumbersState;
    choose: (choice: Omit<LineNumbersChoice, 'section'>) => void;
  };
  watermark: { watermark: Watermark | undefined; apply: (next: Watermark | undefined) => void };
}) {
  const spec = [LINE_NUMBERS_PANEL, WATERMARK_PANEL].find((p) => p.id === panels.open.right);
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
      {spec === LINE_NUMBERS_PANEL ? (
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
