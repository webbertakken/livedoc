// The languages a domain export writes types in (docs/specs/021-event-storming/domain-export.md "The language"): how a
// repository says which it is, and how each expresses the building blocks. The idioms are the per-language guidance of
// the domain-modelling research, so a model writes code the language's own community would recognise.

export const DOMAIN_EXPORT_LANGUAGES = [
  'typescript',
  'python',
  'go',
  'rust',
  'csharp',
  'java',
  'kotlin',
  'dart',
] as const;
export type DomainLanguage = (typeof DOMAIN_EXPORT_LANGUAGES)[number];

export function isDomainLanguage(value: string): value is DomainLanguage {
  return (DOMAIN_EXPORT_LANGUAGES as readonly string[]).includes(value);
}

// A project file at a repository's root and the language it names. A `*.` entry matches by extension.
export const DOMAIN_LANGUAGE_MARKERS: readonly { file: string; language: DomainLanguage }[] = [
  { file: 'tsconfig.json', language: 'typescript' },
  { file: 'package.json', language: 'typescript' },
  { file: 'pyproject.toml', language: 'python' },
  { file: 'requirements.txt', language: 'python' },
  { file: 'setup.py', language: 'python' },
  { file: 'go.mod', language: 'go' },
  { file: 'Cargo.toml', language: 'rust' },
  { file: '*.csproj', language: 'csharp' },
  { file: '*.sln', language: 'csharp' },
  { file: 'pom.xml', language: 'java' },
  { file: 'build.gradle', language: 'java' },
  { file: 'build.gradle.kts', language: 'kotlin' },
  { file: 'pubspec.yaml', language: 'dart' },
];

const matches = (marker: string, name: string) =>
  marker.startsWith('*.') ? name.endsWith(marker.slice(1)) : name === marker;

export type LanguageVerdict =
  { language: DomainLanguage; because: string } | { language: null; candidates: DomainLanguage[] };

// The language a repository's root names: exactly one candidate, or the candidates (none or several) to choose from.
export function detectDomainLanguage(rootFileNames: readonly string[]): LanguageVerdict {
  const found = new Map<DomainLanguage, string>();
  for (const { file, language } of DOMAIN_LANGUAGE_MARKERS) {
    const hit = rootFileNames.find((name) => matches(file, name));
    if (hit && !found.has(language)) found.set(language, hit);
  }
  // Kotlin's Gradle file says more than Java's: a project with build.gradle.kts is Kotlin.
  if (found.has('kotlin')) found.delete('java');
  const candidates = [...found.keys()];
  if (candidates.length === 1)
    return { language: candidates[0]!, because: `${found.get(candidates[0]!)} at its root` };
  return { language: null, candidates };
}

export const LANGUAGE_IDIOMS: Record<DomainLanguage, { name: string; idioms: string[] }> = {
  typescript: {
    name: 'TypeScript',
    idioms: [
      'Identities and constrained values are branded types (`string & { readonly __brand: "OrderId" }`), made only by a parse function in their module.',
      'Commands, events, states and rejections are discriminated unions on a literal `type` or `status`; check exhaustiveness with a `never` default.',
      'Data is `Readonly<{ ... }>` and `ReadonlyArray`; behaviour is pure functions in a module per concept, not classes.',
      'A result is `{ ok: true; value: T } | { ok: false; error: E }` (or the repository’s own); a rejected promise is a bug, not a domain failure.',
      'Prefer string literal unions to `enum`; use `as const` and `satisfies` for fixed tables.',
      'A non-empty list is `readonly [T, ...T[]]`.',
    ],
  },
  python: {
    name: 'Python',
    idioms: [
      'Values and events are `@dataclass(frozen=True)`, validated in `__post_init__`.',
      'Identities are `typing.NewType`, or frozen dataclasses where the rule must hold at runtime.',
      'Variants are classes joined in a `Union` or `Literal` fields; handle them with `match` and `assert_never`.',
      'Expected failures are returned values (a small result type), not exceptions.',
      'Signatures are `Protocol`s or `Callable` aliases; parse wire data at the edge, map it into plain dataclasses.',
    ],
  },
  go: {
    name: 'Go',
    idioms: [
      'Identities are defined types (`type OrderID string`); values with rules are structs with unexported fields and a constructor returning `(T, error)`.',
      'Closed sets are interfaces with an unexported marker method, one struct per command, event or state.',
      'Domain failures are typed or sentinel errors, checked with `errors.Is` and `errors.As`.',
      'Packages are named after domain concepts (`ordering`), never `models` or `utils`; ports are small interfaces where they are used.',
    ],
  },
  rust: {
    name: 'Rust',
    idioms: [
      'Identities and constrained values are newtypes with private fields and a `TryFrom` or `new` returning `Result`.',
      'Commands, events, states and rejections are enums with data; `match` handles every case.',
      'Derive `Clone, Debug, PartialEq, Eq` for values; an entity compares by its id.',
      'Lifecycle states can be distinct types whose transitions consume `self`.',
      'Ports are traits in the domain crate; reference other aggregates by id, never by `Rc<RefCell<_>>`.',
    ],
  },
  csharp: {
    name: 'C#',
    idioms: [
      'Identities are `readonly record struct OrderId(Guid Value)`; values are records validated in their constructor.',
      'Commands and events are immutable records; a closed set is an abstract record with sealed derived records.',
      'Expected failures are returned values (a result type), not exceptions.',
      'Collections are exposed as `IReadOnlyList<T>`; ports are interfaces in the domain project.',
    ],
  },
  java: {
    name: 'Java',
    idioms: [
      'Values, commands and events are records, validated and normalised in the compact constructor; copy collections with `List.copyOf`.',
      'Closed sets are `sealed interface ... permits ...`; handle them with pattern matching in `switch`.',
      'Identities are single-field records (`record OrderId(UUID value)`).',
      'Expected failures are returned values (a sealed result), not exceptions; ports are interfaces in the domain package.',
    ],
  },
  kotlin: {
    name: 'Kotlin',
    idioms: [
      'Identities are `@JvmInline value class OrderId(val value: String)`.',
      'Commands, events, states and rejections are sealed hierarchies of data classes; `when` is exhaustive.',
      'Constructors that guard rules are private behind a validating factory returning a result.',
      'Ports are interfaces in the domain module; nothing in the domain imports a framework.',
    ],
  },
  dart: {
    name: 'Dart',
    idioms: [
      'Closed sets are `sealed class` hierarchies; a `switch` over them is exhaustive.',
      'Values are immutable classes with `final` fields, `const` constructors, value equality and `copyWith`.',
      'Identities are extension types, or classes with a private constructor where the rule must hold.',
      'The domain is a pure Dart package with no Flutter imports; ports are abstract interface classes.',
    ],
  },
};
