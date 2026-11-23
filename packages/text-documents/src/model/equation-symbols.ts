// The symbols and structures an equation is written with (docs/specs/034-text-documents/objects.md "Equations in the
// editor"): the equation toolbar's menus, in Google's sets and order (default, until a capture), each symbol by the
// name its typed shortcut uses (`\alpha`), and the structures and function names the shortcuts write.
import { Equations, type MathNode } from './equations';

/** The toolbar's menus, in its order. */
export type EquationMenu = 'greek' | 'operations' | 'relations' | 'operators' | 'arrows';
export const EQUATION_MENUS: readonly EquationMenu[] = [
  'greek',
  'operations',
  'relations',
  'operators',
  'arrows',
];
export const EQUATION_MENU_LABELS: Readonly<Record<EquationMenu, string>> = {
  greek: 'Greek letters',
  operations: 'Miscellaneous operations',
  relations: 'Relations',
  operators: 'Math operators',
  arrows: 'Arrows',
};

/** A symbol: its name, as `\name` types it, and its character. */
export type EquationSymbol = { readonly name: string; readonly symbol: string };

const symbols = (pairs: string): EquationSymbol[] =>
  pairs
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [name, symbol] = pair.split('=') as [string, string];
      return { name, symbol };
    });

/** The symbol menus, each in its order (the structures menu is `EQUATION_STRUCTURE_MENU`). */
export const EQUATION_SYMBOLS: Readonly<
  Record<Exclude<EquationMenu, 'operators'>, readonly EquationSymbol[]>
> = {
  greek: symbols(`
    alpha=α beta=β gamma=γ delta=δ epsilon=ϵ varepsilon=ε zeta=ζ eta=η theta=θ vartheta=ϑ iota=ι kappa=κ lambda=λ
    mu=μ nu=ν xi=ξ pi=π varpi=ϖ rho=ρ varrho=ϱ sigma=σ varsigma=ς tau=τ upsilon=υ phi=ϕ varphi=φ chi=χ psi=ψ
    omega=ω Gamma=Γ Delta=Δ Theta=Θ Lambda=Λ Xi=Ξ Pi=Π Sigma=Σ Upsilon=Υ Phi=Φ Psi=Ψ Omega=Ω
  `),
  operations: symbols(`
    times=× div=÷ cdot=⋅ pm=± mp=∓ ast=∗ star=⋆ circ=∘ bullet=∙ oplus=⊕ ominus=⊖ oslash=⊘ otimes=⊗ odot=⊙
    dagger=† ddagger=‡ vee=∨ wedge=∧ cap=∩ cup=∪ aleph=ℵ Re=ℜ Im=ℑ top=⊤ bot=⊥ infty=∞ partial=∂ forall=∀
    exists=∃ neg=¬ triangle=△ diamond=⋄
  `),
  relations: symbols(`
    leq=≤ geq=≥ prec=≺ succ=≻ preceq=⪯ succeq=⪰ ll=≪ gg=≫ equiv=≡ sim=∼ simeq=≃ asymp=≍ approx=≈ ne=≠
    subset=⊂ supset=⊃ subseteq=⊆ supseteq=⊇ in=∈ ni=∋ notin=∉
  `),
  arrows: symbols(`
    leftarrow=← rightarrow=→ uparrow=↑ downarrow=↓ leftrightarrow=↔ updownarrow=↕ Leftarrow=⇐ Rightarrow=⇒
    Uparrow=⇑ Downarrow=⇓ Leftrightarrow=⇔ Updownarrow=⇕
  `),
};

/** Symbols the shortcuts know beyond the menus' (Google's further names). */
const MORE_SYMBOLS = symbols(`
  le=≤ ge=≥ neq=≠ to=→ gets=← dots=… ldots=… cdots=⋯ vdots=⋮ vdash=⊢ hbar=ℏ
`);

const empty = (): MathNode[] => [];
const identifier = (text: string): MathNode => ({ kind: 'identifier', text });
const large = (operator: string) => (): MathNode => ({
  kind: 'large-operator',
  operator,
  lower: empty(),
  upper: empty(),
  body: empty(),
});

/** A structure the shortcuts and the Math operators menu write, empty, by its name. */
export type EquationStructure = { readonly name: string; readonly build: () => MathNode };

/** The Math operators menu, in its order: each a structure with empty rows. */
export const EQUATION_STRUCTURE_MENU: readonly EquationStructure[] = [
  { name: 'frac', build: () => ({ kind: 'fraction', numerator: empty(), denominator: empty() }) },
  { name: 'sqrt', build: () => ({ kind: 'root', radicand: empty() }) },
  { name: 'rootof', build: () => ({ kind: 'root', index: empty(), radicand: empty() }) },
  { name: 'subscript', build: () => ({ kind: 'scripts', base: empty(), sub: empty() }) },
  { name: 'superscript', build: () => ({ kind: 'scripts', base: empty(), sup: empty() }) },
  {
    name: 'subsuperscript',
    build: () => ({ kind: 'scripts', base: empty(), sub: empty(), sup: empty() }),
  },
  { name: 'sum', build: large('∑') },
  { name: 'prod', build: large('∏') },
  { name: 'coprod', build: large('∐') },
  { name: 'bigcap', build: large('⋂') },
  { name: 'bigcup', build: large('⋃') },
  { name: 'int', build: large('∫') },
  { name: 'oint', build: large('∮') },
  { name: 'lim', build: () => ({ kind: 'under-over', base: [identifier('lim')], under: empty() }) },
];

/** Function names a shortcut writes as one upright word (`\sin`). */
export const EQUATION_FUNCTIONS: readonly string[] = `
  sin cos tan sec csc cot sinh cosh tanh coth arcsin arccos arctan arg deg det dim exp gcd hom inf ker lg ln log max
  min Pr sup liminf limsup
`
  .trim()
  .split(/\s+/);

/**
 * What a typed shortcut's name stands for: a symbol as its token, a structure with empty rows, a function's word; none
 * for a name it does not know.
 */
export function equationShortcut(name: string): MathNode | undefined {
  const structure = EQUATION_STRUCTURE_MENU.find((s) => s.name === name);
  if (structure) return structure.build();
  const symbol = [...Object.values(EQUATION_SYMBOLS).flat(), ...MORE_SYMBOLS].find(
    (s) => s.name === name,
  );
  if (symbol) return Equations.token(symbol.symbol);
  return EQUATION_FUNCTIONS.includes(name) ? identifier(name) : undefined;
}
