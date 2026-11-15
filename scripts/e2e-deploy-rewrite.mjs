// The e2e stack's simulated deploy (docs/specs/003-system-architecture/e2e-smoke.md): every reference to a renamed
// chunk in a file rewritten to its new name. Dependency-free, imported by scripts/e2e-stack.mjs.

// A page's data (the RSC payload) rides in `self.__next_f.push([1,"…"])` strings the client joins, and a string
// can end in the middle of a chunk's name. Each such name is moved whole into the string it ends in, so the rename
// below finds it as it finds every other.
const PAGE_DATA = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const NAME_CHAR = /[A-Za-z0-9_-]/;

// A string as Next writes it into a script: JSON, with what could end the script escaped.
function scriptString(text) {
  return JSON.stringify(text)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// The head of a chunk name `segment` ends with, when `next` carries the rest of that name; else ''. Only the
// run of file-name characters either side of the boundary can hold one.
function straddlingHead(segment, next, names) {
  const tail = /[\w.-]*$/.exec(segment)[0];
  if (!tail) return '';
  const around = tail + /^[\w.-]*/.exec(next)[0];
  for (let p = 0; p < tail.length; p++) {
    const before = p === 0 ? segment[segment.length - tail.length - 1] : around[p - 1];
    if (before !== undefined && NAME_CHAR.test(before)) continue;
    const name = names.find((n) => p + n.length > tail.length && around.startsWith(n, p));
    if (name) return tail.slice(p);
  }
  return '';
}

function wholeNamesInPageData(text, names) {
  const matches = [...text.matchAll(PAGE_DATA)];
  if (matches.length < 2) return text;
  const segments = matches.map((m) => JSON.parse(m[1]));
  const changed = new Set();
  for (let i = 0; i < segments.length - 1; i++) {
    const head = straddlingHead(segments[i], segments[i + 1], names);
    if (!head) continue;
    segments[i] = segments[i].slice(0, -head.length);
    segments[i + 1] = head + segments[i + 1];
    changed.add(i).add(i + 1);
  }
  if (changed.size === 0) return text;
  let out = '';
  let at = 0;
  matches.forEach((m, i) => {
    const start = m.index + m[0].indexOf(m[1]);
    out += text.slice(at, start) + (changed.has(i) ? scriptString(segments[i]) : m[1]);
    at = start + m[1].length;
  });
  return out + text.slice(at);
}

/**
 * `text` with every chunk named in `renames` (old name to new) renamed.
 * @param {string} text
 * @param {Map<string, string>} renames
 * @returns {string}
 */
export function renameChunkReferences(text, renames) {
  const names = [...renames.keys()];
  if (names.length === 0) return text;
  const escaped = names.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![A-Za-z0-9_-])(${escaped.join('|')})`, 'g');
  return wholeNamesInPageData(text, names).replace(pattern, (m) => renames.get(m) ?? m);
}
