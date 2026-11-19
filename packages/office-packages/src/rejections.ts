// The named rejections of a package read (docs/specs/020-import-export/office-packages.md "Named rejections").

export const PACKAGE_REJECTIONS = [
  'package_damaged',
  'package_too_large',
  'package_encrypted',
  'package_wrong_type',
  'picture_too_large',
  'document_too_large',
  'xml_doctype_refused',
  'xml_malformed',
] as const;

export type PackageRejection = (typeof PACKAGE_REJECTIONS)[number];

/** A refused read: the rejection, and where it was found (an entry, a line), never content. */
export type PackageRefusal = {
  ok: false;
  rejection: PackageRejection;
  entry?: string;
  line?: number;
};

export const refuse = (
  rejection: PackageRejection,
  where: { entry?: string; line?: number } = {},
): PackageRefusal => ({ ok: false, rejection, ...where });
