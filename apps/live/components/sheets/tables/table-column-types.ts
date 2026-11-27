// A table column's types as people read them (docs/specs/029-sheets/data-tools.md "Tables"): Table Settings' Column
// Types and the column menu's Edit Column Type list them, None first.
import { TABLE_COLUMN_TYPES, type TableColumnType } from '@livedoc/sheets';

/** Each column type's words, None first (data-tools.md "Tables"). */
export const COLUMN_TYPE_LABELS: Readonly<Record<TableColumnType | 'none', string>> = {
  none: 'None',
  text: 'Text',
  number: 'Number',
  percent: 'Percent',
  currency: 'Currency',
  date: 'Date',
  time: 'Time',
  dateTime: 'Date Time',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
};

/** The types as the lists offer them, None first. */
export const COLUMN_TYPE_CHOICES: readonly (TableColumnType | 'none')[] = [
  'none',
  ...TABLE_COLUMN_TYPES,
];
