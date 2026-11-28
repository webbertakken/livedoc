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
export { droppedEntryKind, type DroppedEntryKind } from './dropped-entries';
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
  isDroppedOdfEntry,
  looksLikeXml,
  odfManifest,
  PACKAGE_DATE,
  readOdfPackage,
  writeOdfPackage,
  type OdfEntry,
  type OdfPackage,
  type OdfPackageRead,
} from './odf/odf-package';
export {
  keptXmlOf,
  keptXmlWithin,
  serializeXml,
  startTagBindings,
  type KeptXml,
} from './xml/kept-xml';
export { isElementNamed, textContent, type XmlBindings, type XmlParsed } from './xml/xml-tree';
export { readPackageEntries, startsWithZip } from './zip/package-entries';
export {
  emuToPt,
  fractionToOdfPercent,
  halfPointsToPt,
  odfLengthToPt,
  odfPercent,
  ptToEmu,
  ptToHalfPoints,
  ptToOdf,
  ptToTwips,
  round3,
  twipsToPt,
} from './units';
export {
  colourToOoxml,
  odfColour,
  OOXML_HIGHLIGHTS,
  ooxmlColour,
  ooxmlHighlightName,
} from './colours';
export { base64OfBytes, bytesOfBase64 } from './base64';
export {
  isMappedPictureType,
  isPictureTooLarge,
  MAPPED_PICTURE_TYPES,
  mediaKeyOf,
  PICTURE_DEFAULT_DPI,
  PICTURE_EXTENSIONS,
  PICTURE_MAX_PIXELS,
  pictureHeader,
  pictureOwnSize,
  type MappedPictureType,
  type PictureHeader,
} from './pictures';
export {
  EXTENDED_PROPERTIES_NS,
  odfMetaChildren,
  ooxmlAppXml,
  ooxmlCoreXml,
  readOdfMeta,
  readOoxmlMetadata,
  statisticsOf,
  type DocumentMetadata,
  type DocumentStatistics,
} from './metadata/metadata';
export {
  OOXML_CONTENT_TYPES,
  OPC_NS,
  RELATIONSHIP_TYPES,
  transitionalType,
} from './ooxml/ooxml-namespaces';
export { oleKind } from './ooxml/ole';
export {
  isDroppedOoxmlPart,
  isDroppedOoxmlRelationship,
  readOoxmlPackage,
  relationshipPartOf,
  relationshipsXml,
  resolvePartName,
  writeOoxmlPackage,
  type OoxmlPackage,
  type OoxmlPackageRead,
  type OoxmlPart,
  type Relationship,
  type Relationships,
} from './ooxml/ooxml-package';
export { downloadFileName } from './file-name';
export { packageKind, type PackageKind } from './package-kind';
