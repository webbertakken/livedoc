// The model is asked for JSON and given JSON mode, but a reasoning model still
// sometimes wraps its answer in a fence or a sentence. Take the JSON out of
// whatever shape it arrived in, rather than trusting the mode to have worked.
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* not bare JSON */
  }
  const fenced = trimmed.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  if (fenced !== trimmed) {
    try {
      return JSON.parse(fenced);
    } catch {
      /* not a clean fence either */
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}
