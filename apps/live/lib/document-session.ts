import type { AccessLevel } from '@livedoc/api-schema';

// Resolve the viewer's session against a fetched document (docs/specs/014-identity/auth-and-guest-access.md +
// docs/specs/015-api/api.md). Security-critical: it decides whether the caller is the
// owner (always 'edit', never carries a share code) or a visitor (role
// + share code come from the link they followed). The same
// `ownerId === selfId` test was inlined six times in the hydration
// path; a slip in any one (e.g. treating an owner as a visitor, or
// keeping a visitor's code on an owner request) corrupts authorisation,
// so it lives here once, under test.
//
//   - isOwner:          the document belongs to this session's id.
//   - sessionRole:      owners edit; visitors inherit the link's role.
//   - sessionShareCode: owners send none; visitors carry the code that
//                       admitted them so write paths can authorise.
type DocumentSession = {
  isOwner: boolean;
  sessionRole: AccessLevel;
  sessionShareCode: string | null;
};

export function resolveDocumentSession(input: {
  documentOwnerId: string;
  selfId: string;
  shareRole: AccessLevel;
  shareCodeParam: string | null;
  // The embed view (docs/specs/013-workspace/embeds.md): below Editor it only looks, having no identity screen to
  // put a name on what it adds (docs/specs/013-workspace/share-roles.md, SR6).
  embed?: boolean;
}): DocumentSession {
  const isOwner = input.documentOwnerId === input.selfId;
  const linkRole = input.embed && input.shareRole !== 'edit' ? 'view' : input.shareRole;
  return {
    isOwner,
    sessionRole: isOwner ? 'edit' : linkRole,
    sessionShareCode: isOwner ? null : input.shareCodeParam,
  };
}
