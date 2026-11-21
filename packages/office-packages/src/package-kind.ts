// Which kind of package a file's bytes are (docs/specs/020-import-export/office-packages.md "Reading a package" steps 1
// and 4), before either reader runs: an ODF flat file, an OOXML container (or an OLE file standing for one, which its
// reader refuses by name), else an ODF package, whose reader refuses what is not one.
import { looksLikeXml } from './odf/odf-package';
import { oleKind } from './ooxml/ole';
import { startsWithZip } from './zip/package-entries';
import { listZip } from './zip/zip-reader';

export type PackageKind = 'flat' | 'ooxml' | 'odf';

export function packageKind(bytes: Uint8Array): PackageKind {
  if (looksLikeXml(bytes)) return 'flat';
  if (oleKind(bytes)) return 'ooxml';
  if (!startsWithZip(bytes)) return 'odf';
  const listed = listZip(bytes);
  return listed.ok && listed.entries.some((e) => e.name === '[Content_Types].xml')
    ? 'ooxml'
    : 'odf';
}
