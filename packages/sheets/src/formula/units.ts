// The units CONVERT knows (docs/specs/029-sheets/formulas.md "Functions": Parser): Excel's and OpenFormula's list,
// the wider form of Google's (D38), each unit's size in its class's base unit by its exact definition (NIST SP 811),
// with the metric prefixes the metric units take. A flat catalogue (exempt from the size rule).

export type UnitClass =
  | 'mass'
  | 'length'
  | 'time'
  | 'pressure'
  | 'force'
  | 'energy'
  | 'power'
  | 'magnetism'
  | 'temperature'
  | 'volume'
  | 'area'
  | 'speed'
  | 'information';

// A unit: its class, its size in the class's base unit (g, m, s, Pa, N, J, W, T, K, l, m², m/s, bit), whether a
// metric prefix may go before it, and for a temperature the offset added after scaling to kelvin. A size of a ninth
// is written as 5 `per` 9, so 491.67 °Ra comes to 273.15 K exactly.
type UnitDef = { cls: UnitClass; size: number; per?: number; prefixed?: true; offset?: number };

const INCH = 0.0254;
const FOOT = 0.3048;
const YARD = 0.9144;
const MILE = 1609.344;
const NAUTICAL_MILE = 1852;
const SURVEY_MILE = (5280 * 1200) / 3937;
const LIGHT_YEAR = 9460730472580800;
// A parsec: 648000 / π astronomical units of 149597870700 m.
const PARSEC = (648000 / Math.PI) * 149597870700;
const PICA_POINT = INCH / 72;
const PICA = INCH / 6;
const POUND = 453.59237;
const GRAVITY = 9.80665;
const POUND_FORCE = (POUND / 1000) * GRAVITY;
const GALLON = 3.785411784;
const UK_GALLON = 4.54609;
// Mechanical horsepower: 550 foot-pounds-force a second.
const HORSEPOWER = 550 * FOOT * POUND_FORCE;

const def = (cls: UnitClass, size: number, prefixed = false): UnitDef =>
  prefixed ? { cls, size, prefixed: true } : { cls, size };

// Powers of a length as area (m², litres for volume: 1 m³ is 1000 l).
const square = (metres: number) => def('area', metres * metres);
const cube = (metres: number) => def('volume', metres ** 3 * 1000);

const UNITS: Readonly<Record<string, UnitDef>> = {
  // Mass, in grams.
  g: def('mass', 1, true),
  sg: def('mass', (POUND_FORCE / FOOT) * 1000),
  lbm: def('mass', POUND),
  u: def('mass', 1 / 6.022137e23, true),
  ozm: def('mass', POUND / 16),
  grain: def('mass', POUND / 7000),
  cwt: def('mass', POUND * 100),
  shweight: def('mass', POUND * 100),
  uk_cwt: def('mass', POUND * 112),
  lcwt: def('mass', POUND * 112),
  hweight: def('mass', POUND * 112),
  stone: def('mass', POUND * 14),
  ton: def('mass', POUND * 2000),
  uk_ton: def('mass', POUND * 2240),
  LTON: def('mass', POUND * 2240),
  brton: def('mass', POUND * 2240),
  // Length, in metres.
  m: def('length', 1, true),
  mi: def('length', MILE),
  Nmi: def('length', NAUTICAL_MILE),
  in: def('length', INCH),
  ft: def('length', FOOT),
  yd: def('length', YARD),
  ang: def('length', 1e-10, true),
  ell: def('length', INCH * 45),
  ly: def('length', LIGHT_YEAR, true),
  parsec: def('length', PARSEC, true),
  pc: def('length', PARSEC, true),
  Picapt: def('length', PICA_POINT),
  Pica: def('length', PICA_POINT),
  pica: def('length', PICA),
  survey_mi: def('length', SURVEY_MILE),
  // Time, in seconds.
  yr: def('time', 365.25 * 86400),
  day: def('time', 86400),
  d: def('time', 86400),
  hr: def('time', 3600),
  mn: def('time', 60),
  min: def('time', 60),
  sec: def('time', 1, true),
  s: def('time', 1, true),
  // Pressure, in pascals.
  Pa: def('pressure', 1, true),
  p: def('pressure', 1, true),
  atm: def('pressure', 101325, true),
  at: def('pressure', 101325, true),
  mmHg: def('pressure', 133.322387415, true),
  Torr: def('pressure', 101325 / 760),
  psi: def('pressure', POUND_FORCE / (INCH * INCH)),
  // Force, in newtons.
  N: def('force', 1, true),
  dyn: def('force', 1e-5, true),
  dy: def('force', 1e-5, true),
  lbf: def('force', POUND_FORCE),
  pond: def('force', GRAVITY / 1000, true),
  // Energy, in joules.
  J: def('energy', 1, true),
  e: def('energy', 1e-7, true),
  c: def('energy', 4.184, true),
  cal: def('energy', 4.1868, true),
  eV: def('energy', 1.602176634e-19, true),
  ev: def('energy', 1.602176634e-19, true),
  HPh: def('energy', HORSEPOWER * 3600),
  hh: def('energy', HORSEPOWER * 3600),
  Wh: def('energy', 3600, true),
  wh: def('energy', 3600, true),
  // The foot-poundal, as Excel and LibreOffice size "flb".
  flb: def('energy', FOOT * (POUND / 1000) * FOOT),
  BTU: def('energy', 1055.05585262),
  btu: def('energy', 1055.05585262),
  // Power, in watts.
  W: def('power', 1, true),
  w: def('power', 1, true),
  HP: def('power', HORSEPOWER),
  h: def('power', HORSEPOWER),
  PS: def('power', 75 * GRAVITY),
  // Magnetism, in teslas.
  T: def('magnetism', 1, true),
  ga: def('magnetism', 1e-4, true),
  // Temperature: kelvin = value × size + offset.
  C: { cls: 'temperature', size: 1, offset: 273.15 },
  cel: { cls: 'temperature', size: 1, offset: 273.15 },
  F: { cls: 'temperature', size: 5, per: 9, offset: 273.15 - (32 * 5) / 9 },
  fah: { cls: 'temperature', size: 5, per: 9, offset: 273.15 - (32 * 5) / 9 },
  K: { cls: 'temperature', size: 1, prefixed: true, offset: 0 },
  kel: { cls: 'temperature', size: 1, prefixed: true, offset: 0 },
  Rank: { cls: 'temperature', size: 5, per: 9, offset: 0 },
  Reau: { cls: 'temperature', size: 1.25, offset: 273.15 },
  // Volume, in litres.
  tsp: def('volume', GALLON / 768),
  tspm: def('volume', 0.005),
  tbs: def('volume', GALLON / 256),
  oz: def('volume', GALLON / 128),
  cup: def('volume', GALLON / 16),
  pt: def('volume', GALLON / 8),
  us_pt: def('volume', GALLON / 8),
  uk_pt: def('volume', UK_GALLON / 8),
  qt: def('volume', GALLON / 4),
  uk_qt: def('volume', UK_GALLON / 4),
  gal: def('volume', GALLON),
  uk_gal: def('volume', UK_GALLON),
  l: def('volume', 1, true),
  L: def('volume', 1, true),
  lt: def('volume', 1, true),
  m3: { ...cube(1), prefixed: true },
  ang3: { ...cube(1e-10), prefixed: true },
  mi3: cube(MILE),
  Nmi3: cube(NAUTICAL_MILE),
  in3: cube(INCH),
  ft3: cube(FOOT),
  yd3: cube(YARD),
  ly3: cube(LIGHT_YEAR),
  Picapt3: cube(PICA_POINT),
  Pica3: cube(PICA_POINT),
  pica3: cube(PICA),
  barrel: def('volume', GALLON * 42),
  bushel: def('volume', 35.23907016688),
  GRT: def('volume', FOOT ** 3 * 100 * 1000),
  regton: def('volume', FOOT ** 3 * 100 * 1000),
  MTON: def('volume', FOOT ** 3 * 40 * 1000),
  // Area, in square metres.
  m2: { ...square(1), prefixed: true },
  ang2: { ...square(1e-10), prefixed: true },
  mi2: square(MILE),
  Nmi2: square(NAUTICAL_MILE),
  in2: square(INCH),
  ft2: square(FOOT),
  yd2: square(YARD),
  ly2: square(LIGHT_YEAR),
  Picapt2: square(PICA_POINT),
  Pica2: square(PICA_POINT),
  pica2: square(PICA),
  Morgen: def('area', 2500),
  ar: def('area', 100, true),
  uk_acre: def('area', 4046.8564224),
  us_acre: def('area', 4046.8564224 * (SURVEY_MILE / MILE) ** 2),
  ha: def('area', 10000),
  // Speed, in metres per second.
  'm/s': def('speed', 1, true),
  'm/sec': def('speed', 1, true),
  'm/h': def('speed', 1 / 3600, true),
  'm/hr': def('speed', 1 / 3600, true),
  mph: def('speed', MILE / 3600),
  kn: def('speed', NAUTICAL_MILE / 3600),
  admkn: def('speed', (6080 * FOOT) / 3600),
  // Information, in bits.
  bit: def('information', 1, true),
  byte: def('information', 8, true),
};

const METRIC_PREFIXES: Readonly<Record<string, number>> = {
  Y: 1e24,
  Z: 1e21,
  E: 1e18,
  P: 1e15,
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  h: 1e2,
  da: 1e1,
  e: 1e1,
  d: 1e-1,
  c: 1e-2,
  m: 1e-3,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
  a: 1e-18,
  z: 1e-21,
  y: 1e-24,
};

// The binary prefixes, for bits and bytes only.
const BINARY_PREFIXES: Readonly<Record<string, number>> = {
  Yi: 2 ** 80,
  Zi: 2 ** 70,
  Ei: 2 ** 60,
  Pi: 2 ** 50,
  Ti: 2 ** 40,
  Gi: 2 ** 30,
  Mi: 2 ** 20,
  ki: 2 ** 10,
};

export type Unit = { cls: UnitClass; size: number; per: number; offset: number };

const own = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key);

// A unit with a prefix: the prefix's factor raised to the unit's power (km² is 10⁶ m²).
function prefixedUnit(name: string): Unit | null {
  for (const len of [2, 1]) {
    const head = name.slice(0, len);
    const base = UNITS[name.slice(len)];
    if (!base?.prefixed || !own(UNITS, name.slice(len))) continue;
    const power =
      base.cls === 'area' && /2$/.test(name) ? 2 : base.cls === 'volume' && /3$/.test(name) ? 3 : 1;
    if (own(METRIC_PREFIXES, head))
      return {
        cls: base.cls,
        size: base.size * METRIC_PREFIXES[head]! ** power,
        per: 1,
        offset: 0,
      };
    if (base.cls === 'information' && own(BINARY_PREFIXES, head))
      return { cls: base.cls, size: base.size * BINARY_PREFIXES[head]!, per: 1, offset: 0 };
  }
  return null;
}

/** A unit by its name, case kept (`"km"`, `"ft^2"`, `"Gibyte"`); null when CONVERT does not know it. */
export function findUnit(text: string): Unit | null {
  const name = text.replace('^', '');
  if (own(UNITS, name)) {
    const u = UNITS[name]!;
    return { cls: u.cls, size: u.size, per: u.per ?? 1, offset: u.offset ?? 0 };
  }
  return prefixedUnit(name);
}
