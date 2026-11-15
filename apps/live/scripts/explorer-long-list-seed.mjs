// Seeds one guest with a folder of many documents (default 1,000), for measuring the Explorer's long lists
// (docs/specs/016-platform/web-performance.md "Long lists"). Prints the seed as JSON for
// explorer-long-list-measure.mjs. Usage: node explorer-long-list-seed.mjs <base-url> [count] > seed.json
const base = process.argv[2] ?? 'http://localhost:3522';
const count = Number(process.argv[3] ?? 1000);
const api = `${base}/api`;
const WORDS = [
  'Roadmap',
  'Retro',
  'Kanban',
  'Planning',
  'Ideas',
  'Sprint',
  'Notes',
  'Design',
  'Review',
  'Launch',
];

const guest = await (await fetch(`${api}/guest-id`, { method: 'POST', body: '{}' })).json();
const headers = {
  'X-Owner-Id': guest.ownerId,
  ...(guest.ownerSig ? { 'X-Owner-Sig': guest.ownerSig } : {}),
  Origin: base,
  'Content-Type': 'application/json',
};

// The api allows 300 writes a minute per person: a 429 waits and tries again.
async function post(path, body) {
  let res = await fetch(`${api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  while (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    res = await fetch(`${api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  }
  if (!res.ok)
    throw new Error(`[long-list-seed] POST ${path} failed: ${res.status} ${await res.text()}`);
}

const folderId = crypto.randomUUID();
await post('/folders', { id: folderId, name: 'Archive' });

// A drawn page each, so every row asks for a real thumbnail.
const tab = (i) => ({
  id: crypto.randomUUID(),
  name: 'Page',
  elements: [
    {
      id: 'a',
      type: 'shape',
      shape: 'square',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      label: `Box ${i}`,
    },
    {
      id: 'b',
      type: 'shape',
      shape: 'square',
      x: 300,
      y: 0,
      width: 200,
      height: 100,
      label: 'Next',
    },
    {
      id: 'x',
      type: 'arrow',
      from: { kind: 'pinned', elementId: 'a', anchor: 'e' },
      to: { kind: 'pinned', elementId: 'b', anchor: 'w' },
    },
  ],
});
const names = [];
const now = Date.now();
for (let i = 0; i < count; i += 1)
  names.push(`${WORDS[i % WORDS.length]} ${String(i + 1).padStart(4, '0')}`);

const CONCURRENCY = 16;
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < count) {
      const i = next++;
      await post('/documents', {
        id: crypto.randomUUID(),
        name: names[i],
        folderId,
        tabs: [tab(i)],
        createdAt: now - i * 60_000 - 1000,
        savedAt: now - i * 60_000,
        markUsed: false,
      });
    }
  }),
);
console.error(`[long-list-seed] ${count} documents in folder ${folderId}`);
console.log(
  JSON.stringify({
    ownerId: guest.ownerId,
    ownerSig: guest.ownerSig ?? null,
    folderId,
    count,
    names,
  }),
);
