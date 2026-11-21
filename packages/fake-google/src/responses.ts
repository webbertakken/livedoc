// The shapes of the fake's answers: JSON with CORS, and Drive's error body.

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization,content-type,x-upload-content-type,x-goog-drive-resource-keys',
  'Access-Control-Expose-Headers': 'Location',
};

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...headers },
  });
}

export function driveError(status: number, reason: string, message = reason): Response {
  return jsonResponse(status, {
    error: { code: status, message, errors: [{ domain: 'global', reason, message }] },
  });
}
