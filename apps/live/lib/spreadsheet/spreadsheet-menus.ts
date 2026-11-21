// The spreadsheet's menus in the office shell (docs/specs/004-interface-design/office-shell.md "Menus as data";
// docs/specs/029-sheets/files-and-print.md): File with Open, Download in the three native formats and Convert to the
// other standard, until plan 0020 declares the rest.
import type { WorkbookFormat } from '@livedoc/sheets';
import { convertedFormat } from '@livedoc/sheets/files';
import type { OfficeCatalogue } from '@/lib/office/office-catalogue';

/** File › Download's native formats, in Google's order: each item's id, the format it writes, its words. */
export const DOWNLOAD_ITEMS: readonly { id: string; format: WorkbookFormat; label: string }[] = [
  { id: 'download-xlsx', format: 'xlsx', label: 'Microsoft Excel (.xlsx)' },
  { id: 'download-ods', format: 'ods', label: 'OpenDocument (.ods)' },
  { id: 'download-fods', format: 'fods', label: 'Flat OpenDocument (.fods)' },
];

/** The id File › Convert is bound by; its words name the format it goes to. */
export const CONVERT_ITEM_ID = 'convert';

const CONVERT_LABEL: Record<WorkbookFormat, string> = {
  xlsx: 'Convert to Excel (.xlsx)',
  ods: 'Convert to OpenDocument (.ods)',
  fods: 'Convert to OpenDocument (.ods)',
};

export function spreadsheetMenus(format: WorkbookFormat): OfficeCatalogue {
  return [
    {
      id: 'file',
      label: 'File',
      entries: [
        { kind: 'item', id: 'open', label: 'Open', level: 'view', status: 'built' },
        {
          kind: 'submenu',
          id: 'download',
          label: 'Download',
          entries: DOWNLOAD_ITEMS.map(({ id, label }) => ({
            kind: 'item',
            id,
            label,
            level: 'view',
            status: 'built',
          })),
        },
        {
          kind: 'item',
          id: CONVERT_ITEM_ID,
          label: CONVERT_LABEL[convertedFormat(format)],
          level: 'edit',
          status: 'built',
          keywords: ['format', 'xlsx', 'ods'],
        },
      ],
    },
  ];
}
