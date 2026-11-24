'use client';

// The Table properties side panel's body (docs/specs/034-text-documents/tables.md "Table properties"): Rows, Columns,
// Alignment, Colour and Cell, each a section that folds; each field shows what the cells it changes share, blank where
// they differ. A list or a colour applies at once; a length on Enter or when its field is left. Outside a table it says
// where to put the cursor.
import type { CellVerticalAlign } from '@livedoc/text-documents';
import {
  OFFICE_NO_COLOUR,
  OfficeDialogColourField,
} from '@/components/office/OfficeDialogColourField';
import type { IndentUnit } from '@/lib/text-document/indent-units';
import {
  TABLE_BORDER_WIDTHS,
  type TableAlignChoice,
  type TableProperties,
  type TablePropertyChange,
} from '@/lib/text-document/text-document-table-properties';
import {
  PANEL_CHECK,
  PANEL_CHECK_ROW,
  PANEL_CONTROL,
  PANEL_LABEL,
  PanelLengthField,
  PanelListField,
  PanelSection,
} from './TextDocumentPanelFields';

const VERTICAL: readonly (readonly [CellVerticalAlign, string])[] = [
  ['top', 'Top'],
  ['middle', 'Middle'],
  ['bottom', 'Bottom'],
];
const ALIGN: readonly (readonly [TableAlignChoice, string])[] = [
  ['start', 'Left'],
  ['center', 'Center'],
  ['end', 'Right'],
];
const widthWords = (pt: number) => `${pt} pt`;

export function TextDocumentTablePropertiesPanel({
  properties,
  unit,
  onChange,
}: {
  // The caret's table's, or null outside one.
  properties: TableProperties | null;
  unit: IndentUnit;
  onChange: (change: TablePropertyChange) => void;
}) {
  if (!properties)
    return (
      <p className="px-2 pt-1 text-body text-(--office-muted)">
        Put the cursor in a table to see its properties.
      </p>
    );
  const p = properties;
  // Each length field starts again from the value shown when that value changes.
  const length = (
    label: string,
    pt: number | null,
    field: 'rowHeight' | 'columnWidth' | 'indent' | 'padding',
    extra: { disabled?: boolean; start?: boolean } = {},
  ) => (
    <PanelLengthField
      key={`${field}:${pt ?? 'mixed'}`}
      label={label}
      pt={pt}
      unit={unit}
      {...extra}
      onCommit={(value) => onChange({ field, value })}
    />
  );
  return (
    <div className="flex flex-col gap-1 px-1 pt-1">
      <PanelSection title="Rows">
        {length('Minimum row height', p.rowHeight, 'rowHeight', { start: true })}
        <PanelListField
          label="Pin header rows"
          value={String(p.headerRows)}
          options={Array.from(
            { length: p.mostHeaderRows + 1 },
            (_, n) => [String(n), n === 0 ? 'None' : String(n)] as const,
          )}
          onChoose={(value) => onChange({ field: 'headerRows', value: Number(value) })}
        />
        <label className={PANEL_CHECK_ROW}>
          <input
            type="checkbox"
            className={PANEL_CHECK}
            checked={p.rowBreaks ?? false}
            // Mixed where the rows differ.
            ref={(box) => {
              if (box) box.indeterminate = p.rowBreaks === null;
            }}
            onChange={(e) => onChange({ field: 'rowBreaks', value: e.target.checked })}
          />
          Allow row to overflow across pages
        </label>
      </PanelSection>
      <PanelSection title="Columns">
        {length('Column width', p.columnWidth, 'columnWidth')}
      </PanelSection>
      <PanelSection title="Alignment">
        <PanelListField
          label="Cell vertical alignment"
          value={p.verticalAlign}
          options={VERTICAL}
          onChoose={(value) => onChange({ field: 'verticalAlign', value })}
        />
        <PanelListField
          label="Table alignment"
          value={p.align}
          options={ALIGN}
          onChoose={(value) => onChange({ field: 'align', value })}
        />
        {length('Left indent', p.indent, 'indent', { disabled: p.align !== 'start' })}
      </PanelSection>
      <PanelSection title="Colour">
        <div className="flex items-end gap-3">
          <div className="flex flex-col">
            <span className={PANEL_LABEL}>Table border</span>
            <OfficeDialogColourField
              label="Table border colour"
              value={p.borderColor}
              className={PANEL_CONTROL}
              onPick={(value) => onChange({ field: 'borderColor', value })}
            />
          </div>
          <div className="min-w-0 flex-1">
            <PanelListField
              label="Border width"
              value={p.borderWidth === null ? null : String(p.borderWidth)}
              options={TABLE_BORDER_WIDTHS.map((w) => [String(w), widthWords(w)] as const)}
              onChoose={(value) => onChange({ field: 'borderWidth', value: Number(value) })}
            />
          </div>
        </div>
        <div className="flex flex-col">
          <span className={PANEL_LABEL}>Cell background colour</span>
          <OfficeDialogColourField
            label="Cell background colour"
            value={p.background === null ? null : p.background || OFFICE_NO_COLOUR}
            leading="None"
            className={PANEL_CONTROL}
            onPick={(value) =>
              onChange({ field: 'background', value: value === OFFICE_NO_COLOUR ? null : value })
            }
          />
        </div>
      </PanelSection>
      <PanelSection title="Cell">{length('Cell padding', p.padding, 'padding')}</PanelSection>
    </div>
  );
}
