// The shape of an API token (docs/specs/015-api/public-api-and-tokens.md): `livedoc_` and its random part. Shared
// by the api worker, which routes a `Bearer livedoc_…` to the token path, and the CLI, which refuses a malformed
// LIVEDOC_TOKEN before sending it (docs/specs/015-api/cli.md CLI63).

export const API_TOKEN_PREFIX = 'livedoc_';

export function isApiTokenFormat(value: string): boolean {
  return value.startsWith(API_TOKEN_PREFIX) && value.length > API_TOKEN_PREFIX.length + 20;
}
