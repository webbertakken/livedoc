// The office packages (docs/specs/020-import-export/office-packages.md): the shared, DOM-free layer every office file
// LiveDoc reads or writes stands on, for both native formats.
export { BudgetExceeded, ByteBudget, inflateBytes } from './zip/inflate';
export { listZip, readZipEntry, type ZipRefusal } from './zip/zip-reader';
export { crc32, writeZip } from './zip/zip-writer';
export {
  PACKAGE_BUDGETS,
  PACKAGE_MAX_BYTES,
  PACKAGE_MAX_ENTRIES,
  PACKAGE_MAX_INFLATED_BYTES,
  type PackageBudgets,
} from './limits';
export {
  PACKAGE_REJECTIONS,
  refuse,
  type PackageRefusal,
  type PackageRejection,
} from './rejections';
export {
  attributeOf,
  childElement,
  childElements,
  parseXml,
  type XmlAttribute,
  type XmlElement,
  type XmlNode,
  type XmlParse,
} from './xml/xml-tree';
export { escapeXmlAttribute, escapeXmlText, XML_DECLARATION } from './xml/xml-write';
export { isSafeEntryName } from './odf/entry-names';
export { ODF_MEDIA_TYPES, ODF_NS, ODF_VERSION } from './odf/odf-namespaces';
export {
  looksLikeXml,
  odfManifest,
  PACKAGE_DATE,
  readOdfPackage,
  writeOdfPackage,
  type OdfEntry,
  type OdfPackage,
  type OdfPackageRead,
} from './odf/odf-package';
