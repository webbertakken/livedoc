// Whether text is an email address or a web address: data validation's Text rules
// (docs/specs/029-sheets/data-validation.md) and ISEMAIL (formulas.md "Functions": Information) read them alike.

const URL_RE = /^(https?:\/\/[^\s]+|[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?)$/i;

// Something, one @, then a domain with a dot that is neither its first nor its last character; no spaces. Checked
// without a regular expression: the pattern's dotted domain backtracked quadratically on a long run of dots (a cell is
// user input), and this reads the text once.
export function isEmail(text: string): boolean {
  const t = text.trim();
  const at = t.indexOf('@');
  if (at < 1 || at !== t.lastIndexOf('@') || /\s/.test(t)) return false;
  return t.slice(at + 2, -1).includes('.');
}

export function isUrl(text: string): boolean {
  return URL_RE.test(text.trim());
}
