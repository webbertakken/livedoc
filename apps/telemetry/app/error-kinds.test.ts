import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apiFailureCard, type ApiFailureCard } from './error-kinds';
import { EXCEPTIONS } from './metric-catalogue';
import { matches } from './metric-series';

// Every request a caller saw fail (`Error·Api`) lands in exactly one card (docs/specs/017-telemetry/telemetry.md,
// Health › Exceptions). The cards partition the category, so none counts a row twice and none is lost.

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

// Every kind the code emits as `Error·Api`, with the types it sends and the card each lands in. A kind found in the
// emitters below but missing here fails the walk, so a new kind must be given a card on purpose.
const KINDS: Record<string, { types: string[]; card: ApiFailureCard }[]> = {
  Http: [
    {
      types: [
        'Http500.SaveTab',
        'Http503.UpdateDocument',
        'Http503.TabView',
        'Http502.SendEmail',
        'Http500',
      ],
      card: 'ServerFault',
    },
    {
      types: [
        'Http403.LoadTab.Forbidden',
        'Http401.Load.InvalidSession',
        'Http429.SendEmail',
        'Http410',
      ],
      card: 'Refusal',
    },
  ],
  Network: [
    {
      types: ['Network.Put.Documents.Tabs', 'Network.SendEmail', 'Network'],
      card: 'DroppedConnection',
    },
  ],
  Internal: [
    {
      types: ['Internal.Get.Home', 'Internal.Put.Documents.Tabs', 'Internal'],
      card: 'ServerCrash',
    },
    {
      types: ['Internal.FindDocuments', 'Internal.AuthLogin', 'Internal.DocumentLs'],
      card: 'DroppedConnection',
    },
  ],
  Auth: [{ types: ['Auth.NoSessionToken'], card: 'Refusal' }],
  Confined: [{ types: ['Confined.Get.Documents.Tabs'], card: 'Refusal' }],
  SaveFailed: [{ types: ['SaveFailed.TypeError'], card: 'ClientException' }],
  LoadFailed: [{ types: ['LoadFailed.Sheet.TypeError'], card: 'ClientException' }],
  // An email provider's own error code (`<code>.SendEmail`, Cloudflare's `E_…`): a send the provider failed.
  ProviderCode: [{ types: ['E_DELIVERY_FAILED.SendEmail'], card: 'ServerFault' }],
};

// How each emitter spells the kind it sends, read from its source.
const EMISSION_FORMS: { file: string; kinds: (text: string) => string[] }[] = [
  {
    file: 'apps/live/lib/api/error-report.ts',
    kinds: (t) => [
      ...[...t.matchAll(/errorTypeToken\(\s*'(\w+)'/g)].map((m) => m[1]!),
      ...[...t.matchAll(/errorTypeToken\(\s*`Http\$\{/g)].map(() => 'Http'),
      ...[...t.matchAll(/report\('(\w+)\./g)].map((m) => m[1]!),
    ],
  },
  {
    file: 'apps/api/src/request-failure.ts',
    kinds: (t) => [...t.matchAll(/errorTypeToken\(\s*'(\w+)'/g)].map((m) => m[1]!),
  },
  {
    file: 'apps/api/src/email/client.ts',
    kinds: (t) => [
      ...[...t.matchAll(/return `Http\$\{\w+\}\.SendEmail`/g)].map(() => 'Http'),
      ...[...t.matchAll(/return '(\w+)\.SendEmail'/g)].map((m) => m[1]!),
      ...[...t.matchAll(/return `\$\{\w+\}\.SendEmail`/g)].map(() => 'ProviderCode'),
    ],
  },
  {
    file: 'packages/api-client/src/client.ts',
    kinds: (t) => [
      ...[...t.matchAll(/onFailure\?\.\(\s*'(\w+)'/g)].map((m) => m[1]!),
      ...[...t.matchAll(/onFailure\?\.\(\s*`Http\$\{/g)].map(() => 'Http'),
    ],
  },
  {
    file: 'apps/mcp/src/tools.ts',
    kinds: (t) => [...t.matchAll(/reportApiFailure\(\s*env,\s*`Http\$\{/g)].map(() => 'Http'),
  },
  {
    file: 'apps/cli/src/telemetry.ts',
    kinds: (t) => [
      ...[...t.matchAll(/errorTypeToken\(\s*'(\w+)'/g)].map((m) => m[1]!),
      ...[...t.matchAll(/errorTypeToken\(\s*`Http\$\{/g)].map(() => 'Http'),
    ],
  },
];

// Where `Error·Api` is sent from: each file must be read above, so a new emitter cannot go unwalked. The editor's
// boot and the MCP worker's reporter forward a type built elsewhere (error-report.ts, api-client), so they are its
// relays, not its sources.
const RELAYS = new Set([
  'apps/live/components/providers/ErrorTelemetryBoot.tsx',
  'apps/mcp/src/api.ts',
]);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.next-dev',
  'out',
  'dist',
  '.wrangler',
  'e2e',
]);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP_DIRS.has(name)) continue;
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

// The members of the Exceptions stack that can count an `Error·Api` row: the cards the walk checks.
const cardsCounting = (type: string) =>
  EXCEPTIONS.members.filter((m) => matches(m, 'Error', 'Api', type)).map((m) => m.title);

const CARD_TITLE: Record<ApiFailureCard, string> = {
  ServerFault: 'Server Faults',
  Refusal: 'Refusals',
  DroppedConnection: 'Dropped Connections',
  ServerCrash: 'Server Crashes',
  ClientException: 'Client Exceptions',
};

describe('every Error·Api kind the code emits', () => {
  it('reads every file that sends Error·Api', () => {
    const walked = new Set(EMISSION_FORMS.map((f) => f.file));
    const senders = ['apps', 'packages']
      .flatMap((d) => sources(join(REPO, d)))
      .filter((path) => !path.includes('/apps/telemetry/'))
      .filter((path) => /'Error',\s*'Api'/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(REPO, path));
    expect(senders.length).toBeGreaterThan(3);
    const unwalked = senders.filter((path) => !walked.has(path) && !RELAYS.has(path));
    expect(unwalked).toEqual([]);
  });

  it('gives every kind an emitter sends a card', () => {
    const found = new Set<string>();
    for (const form of EMISSION_FORMS) {
      const kinds = form.kinds(readFileSync(join(REPO, form.file), 'utf8'));
      expect(kinds.length, `${form.file} reads as sending nothing`).toBeGreaterThan(0);
      for (const kind of kinds) found.add(kind);
    }
    expect([...found].filter((kind) => !(kind in KINDS))).toEqual([]);
    expect(Object.keys(KINDS).filter((kind) => !found.has(kind))).toEqual([]);
  });

  it.each(
    Object.values(KINDS).flatMap((rules) =>
      rules.flatMap(({ types, card }) => types.map((type) => [type, card] as const)),
    ),
  )('lands %s in %s and in no other card', (type, card) => {
    expect(apiFailureCard(type)).toBe(card);
    expect(cardsCounting(type)).toEqual([CARD_TITLE[card]]);
  });

  it('lands a kind it does not know in Server Faults, where it is seen', () => {
    expect(apiFailureCard('Mystery.Thing')).toBe('ServerFault');
    expect(apiFailureCard(null)).toBe('ServerFault');
    expect(cardsCounting('Mystery.Thing')).toEqual(['Server Faults']);
  });

  it('keeps the client cards to Error·Client rows and the editor own throws', () => {
    expect(
      EXCEPTIONS.members
        .filter((m) => matches(m, 'Error', 'Client', 'Uncaught.Home.TypeError'))
        .map((m) => m.title),
    ).toEqual(['Client Exceptions']);
    expect(
      EXCEPTIONS.members
        .filter((m) => matches(m, 'Error', 'Client', 'RealtimeResync'))
        .map((m) => m.title),
    ).toEqual(['Realtime Resyncs']);
  });
});
