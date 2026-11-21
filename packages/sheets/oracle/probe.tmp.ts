import { readFileSync } from 'node:fs';
import { accessTokenOf, readOAuthClient } from './google-oauth.ts';
import { oracleSecretPaths, readSecret } from './secrets.ts';
const formulas: string[] = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const paths = oracleSecretPaths();
const client = readOAuthClient(JSON.parse(readSecret(paths.client)!));
if (!client.ok) throw new Error('client');
const t = await accessTokenOf(globalThis.fetch, client.client, readSecret(paths.refreshToken)!);
if (!t.ok) throw new Error('token');
const H = { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' };
const made = await (await fetch('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', headers: H,
  body: JSON.stringify({ properties: { title: 'oracle-probe', locale: 'en_US', timeZone: 'Etc/GMT' } }) })).json() as { spreadsheetId: string };
const id = made.spreadsheetId;
console.log('created', id);
try {
  const extra: string[][] = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : [];
  if (extra.length) await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: 'POST', headers: H, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Data' } } }] }) });
  if (extra.length) { const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Data!A1?valueInputOption=USER_ENTERED`, { method: 'PUT', headers: H, body: JSON.stringify({ values: extra }) }); if (!r.ok) console.log(await r.text()); }
  if (process.env.COLW) { const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}`, { headers: H })).json() as { sheets: { properties: { sheetId: number; title: string } }[] }; const sid = meta.sheets.find((x) => x.properties.title === "Data")!.properties.sheetId; const widths = process.env.COLW.split(",").map(Number); const rr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, { method: "POST", headers: H, body: JSON.stringify({ requests: widths.map((w, i) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w }, fields: "pixelSize" } })) }) }); if (!rr.ok) console.log(await rr.text()); }
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sheet1!A1?valueInputOption=USER_ENTERED`, { method: 'PUT', headers: H, body: JSON.stringify({ values: formulas.map((f) => [f]) }) });
  if (!r.ok) console.log(await r.text());
  const v = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sheet1!A1:A${formulas.length}?valueRenderOption=UNFORMATTED_VALUE`, { headers: H })).json() as { values?: unknown[][] };
  formulas.forEach((f, i) => console.log(f, '=>', JSON.stringify(v.values?.[i]?.[0] ?? null)));
} finally {
  const d = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE', headers: H });
  console.log('deleted', id, d.status);
}
