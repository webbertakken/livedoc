'use client';

// The toolbar's font size (docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting", Size): a boxed
// field, as Google's, between − and +. It shows the size at the caret, blank over a mixed selection; a typed size from
// 1 to 400 applies, and a press on the field opens Google's steps. The binding returns focus to the writing.
import { OfficeListField } from './OfficeListField';
import { FONT_SIZE_STEPS, fontSizeLabel, parseFontSizeText } from '@/lib/office/office-font-size';

/** What the kind hands the size field: the size now (read by the toolbar as the caret changes), and how to set one. */
export type OfficeFontSize = { read: () => number | null; set: (pt: number) => void };

const OPTIONS = FONT_SIZE_STEPS.map((value) => ({ label: String(value), value }));

export function OfficeFontSizeField({
  size,
  value,
  tabIndex,
}: {
  size: OfficeFontSize;
  // The size at the caret; null over a mixed selection.
  value: number | null;
  tabIndex: number;
}) {
  return (
    <OfficeListField<number>
      label="Font size"
      listLabel="Font sizes"
      controlId="font-size"
      shown={fontSizeLabel(value)}
      options={OPTIONS}
      selected={value === null ? -1 : FONT_SIZE_STEPS.indexOf(value)}
      parse={parseFontSizeText}
      onTake={size.set}
      tabIndex={tabIndex}
      chevron={false}
      inputClass="mx-0.5 h-6 w-9 rounded-sm border border-(--office-line) text-center"
    />
  );
}
