// The room's side of protected sheets and ranges (docs/specs/029-sheets/data-tools.md "Protected ranges", D347): who a
// write's caller is to a protection, the refusal a protection makes, and a protected sheet's tab kept from deletion.
// Every write door asks: the write route, a sheet changeset, a sheet's rename and a sheet's deletion.
import { Protection, type ProtectionCaller, type SheetLayout } from '@livedoc/sheets';
import { json } from '../responses';
import { gateEdit, type RouteContext } from './context';

/** Who `requester` is to the document's protections: its owner, and whether an Editor. */
export async function protectionCallerOf(
  ctx: RouteContext,
  doc: { documentId: string; ownerId: string; teamId: string | null; scopeTab?: string | null },
  requester: string,
): Promise<ProtectionCaller> {
  const owner = requester === doc.ownerId;
  const editor =
    owner ||
    (await gateEdit(ctx, doc.documentId, doc.ownerId, doc.teamId, doc.scopeTab ?? undefined));
  return { owner, editor };
}

/** A write a protection does not admit: 403 `protected`, its id and what it says, logged. */
export function protectedRefusal(p: Protection, documentId: string): Response {
  console.info('[sheets] protection.refused', { documentId, protection: p.id, can: p.can });
  return json({ error: 'protected', at: p.id, line: Protection.refusalLine(p) }, { status: 403 });
}

/** The protection of a whole sheet that keeps `caller` from deleting it, or null. */
export function sheetDeleteRefusal(
  layout: SheetLayout,
  caller: ProtectionCaller,
): Protection | null {
  return (layout.protections ?? []).find((p) => !p.range && !Protection.admits(p, caller)) ?? null;
}
