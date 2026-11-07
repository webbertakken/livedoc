// Every way the generator refuses to publish an incomplete page
// (docs/specs/002-project-scope/third-party-licences.md).
type LicencesErrorCode =
  | 'BundlerFailed'
  | 'AnalyzeDataMissing'
  | 'AnalyzeFormatUnrecognised'
  | 'MetafileFormatUnrecognised'
  | 'PackageManifestInvalid'
  | 'StorePathUnrecognised'
  | 'VersionMismatch'
  | 'LicenceTextMissing'
  | 'LicenceIdUnknown'
  | 'LicenceNotAllowed'
  | 'UnreviewedBinaryAsset'
  | 'EmbeddedPackageNotShipped'
  | 'TextSourceIntegrity'
  | 'LicencesVerifyFailed';

export class LicencesError extends Error {
  readonly code: LicencesErrorCode;

  constructor(code: LicencesErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = code;
    this.code = code;
  }
}
