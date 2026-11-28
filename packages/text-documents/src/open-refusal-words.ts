// What each named rejection of opening a file says to a person (docs/specs/020-import-export/office-packages.md "Named
// rejections"; docs/specs/034-text-documents/files-and-print.md "Opening"), the editor's File › Open and an agent's alike.
export const TEXT_DOCUMENT_OPEN_REFUSAL_WORDS: Readonly<Record<string, string>> = {
  package_damaged: 'This file is damaged and could not be opened.',
  package_too_large: 'This file is too large to open.',
  package_encrypted:
    'This file is protected by a password. Remove the password, then open it again.',
  package_wrong_type: 'This file is not a text document LiveDoc can open yet.',
  xml_doctype_refused: 'This file holds content LiveDoc never opens.',
  xml_malformed: 'This file is damaged and could not be opened.',
  picture_too_large: 'A picture in this file is too large to open.',
  document_too_large: 'This file is past the 1,020,000-character limit of a text document.',
};
