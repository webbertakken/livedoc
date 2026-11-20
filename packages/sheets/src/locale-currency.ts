// The currency a locale writes money in (docs/specs/029-sheets/formulas.md "Text": DOLLAR), by its region: a locale
// without one is maximised (`en` to `en-US`, `de` to `de-DE`); a region this table lacks writes US dollars (D44).
const REGION_CURRENCY: Readonly<Record<string, string>> = {
  AE: 'AED',
  AR: 'ARS',
  AT: 'EUR',
  AU: 'AUD',
  BD: 'BDT',
  BE: 'EUR',
  BG: 'BGN',
  BR: 'BRL',
  CA: 'CAD',
  CH: 'CHF',
  CL: 'CLP',
  CN: 'CNY',
  CO: 'COP',
  CY: 'EUR',
  CZ: 'CZK',
  DE: 'EUR',
  DK: 'DKK',
  EE: 'EUR',
  EG: 'EGP',
  ES: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  GB: 'GBP',
  GR: 'EUR',
  HK: 'HKD',
  HR: 'EUR',
  HU: 'HUF',
  ID: 'IDR',
  IE: 'EUR',
  IL: 'ILS',
  IN: 'INR',
  IS: 'ISK',
  IT: 'EUR',
  JP: 'JPY',
  KE: 'KES',
  KR: 'KRW',
  LI: 'CHF',
  LT: 'EUR',
  LU: 'EUR',
  LV: 'EUR',
  MT: 'EUR',
  MX: 'MXN',
  MY: 'MYR',
  NG: 'NGN',
  NL: 'EUR',
  NO: 'NOK',
  NZ: 'NZD',
  PE: 'PEN',
  PH: 'PHP',
  PK: 'PKR',
  PL: 'PLN',
  PT: 'EUR',
  RO: 'RON',
  RU: 'RUB',
  SA: 'SAR',
  SE: 'SEK',
  SG: 'SGD',
  SI: 'EUR',
  SK: 'EUR',
  TH: 'THB',
  TR: 'TRY',
  TW: 'TWD',
  UA: 'UAH',
  US: 'USD',
  VN: 'VND',
  ZA: 'ZAR',
};

export const FALLBACK_CURRENCY = 'USD';

/** The ISO 4217 code of the currency a locale writes money in. */
export function localeCurrency(locale: string): string {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return (region && REGION_CURRENCY[region]) ?? FALLBACK_CURRENCY;
  } catch {
    return FALLBACK_CURRENCY;
  }
}
