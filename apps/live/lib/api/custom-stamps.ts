// Custom stamp calls (docs/specs/035-pdf-documents/custom-stamps.md "API"): list, make, rename or move, delete. Owner-
// scoped as custom themes are; guests included (apiHeaders attaches the session token when signed in, else the
// X-Owner-Id header). A refusal is thrown as an ApiError whose `code` is its name.
import type { CustomStampInput, CustomStampPatch, CustomStampRecord } from '@livedoc/pdf-documents';
import { dedupeInFlight } from '../dedupe';
import { API_BASE, apiFetch, apiHeaders, expectOk, expectOkVoid } from './core';

async function _apiListCustomStamps(ownerId: string): Promise<CustomStampRecord[]> {
  const res = await apiFetch(`${API_BASE}/custom-stamps`, { headers: await apiHeaders(ownerId) });
  const { stamps } = await expectOk<{ stamps: CustomStampRecord[] }>(res, 'list custom stamps');
  return stamps;
}
export const apiListCustomStamps = dedupeInFlight(_apiListCustomStamps, (ownerId) => ownerId);

export async function apiCreateCustomStamp(
  ownerId: string,
  input: CustomStampInput,
): Promise<CustomStampRecord> {
  const res = await apiFetch(`${API_BASE}/custom-stamps`, {
    method: 'POST',
    headers: await apiHeaders(ownerId, { body: true }),
    body: JSON.stringify(input),
  });
  const { stamp } = await expectOk<{ stamp: CustomStampRecord }>(res, 'create custom stamp');
  return stamp;
}

export async function apiUpdateCustomStamp(
  ownerId: string,
  id: string,
  patch: CustomStampPatch,
): Promise<CustomStampRecord> {
  const res = await apiFetch(`${API_BASE}/custom-stamps/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: await apiHeaders(ownerId, { body: true }),
    body: JSON.stringify(patch),
  });
  const { stamp } = await expectOk<{ stamp: CustomStampRecord }>(res, 'update custom stamp');
  return stamp;
}

export async function apiDeleteCustomStamp(ownerId: string, id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/custom-stamps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await apiHeaders(ownerId),
  });
  await expectOkVoid(res, 'delete custom stamp');
}
