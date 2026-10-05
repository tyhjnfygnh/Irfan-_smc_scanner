import { ParsedDirection, ParsedSignal, ParseWarning } from './types';

const SYMBOL_ALIASES: Readonly<Record<string, string>> = {
  GOLD: 'XAUUSD',
  SILVER: 'XAGUSD',
};

const CURRENCY_CODES: ReadonlySet<string> = new Set([
  'USD','EUR','GBP','JPY','AUD','CAD','CHF','NZD',
  'SEK','NOK','DKK','PLN','CZK','HUF','RON','TRY',
  'ZAR','MXN','SGD','HKD','CNH','CNY','INR','KRW',
  'THB','MYR','IDR','PHP','VND','BRL','ARS','CLP',
  'RUB','UAH','ILS','SAR','AED','EGP','NGN','KES',
  'XAU','XAG','XPT','XPD',
]);

const CRYPTO_QUOTES: ReadonlyArray<string> = [
  'USDT','USDC','BUSD','TUSD','DAI','USD','EUR','GBP','JPY','BTC','ETH','BNB',
];

const CRYPTO_BASES: ReadonlySet<string> = new Set([
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','DOT','MATIC','LTC','LINK','AVAX',
  'ATOM','TRX','XLM','NEAR','ALGO','FTM','SAND','MANA','SHIB','PEPE','APT','ARB',
  'OP','FIL','ETC','XMR','AAVE','UNI','ICP','HBAR','VET','EGLD','THETA','AXS','GALA',
]);

const INDEX_PREFIXES: ReadonlySet<string> = new Set([
  'NAS','NDX','SPX','US','DJI','DOW','WS','RUT','GER','DAX','UK','JP','HK','AU','EU','CH','CN','IN','WTI','NG',
]);

const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'SL','TP','BUY','SELL','LONG','SHORT','ENTRY','TARGET','TAKEPROFIT','STOP','STOPLOSS',
  'AND','THE','FOR','NOW','NEW','ALL','IF','OR','TO','AT','ON','IN','IS','IT',
  'HIT','HITTED','CLOSE','CLOSED','OPEN','OPENED','PROFIT','LOSS','PIPS','PIP','POINT','POINTS',
  'TIME','HOUR','HOURS','DAY','DAYS','SIGNAL','UPDATE','ALERT','NOTICE','INFO','NEWS',
  'PLAN','IDEA','VIEW','BIAS','SETUP','MOVE','FROM','WITH','THIS','THAT','HERE','THERE',
]);

const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!NUMBER_RE.test(trimmed)) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

interface Token {
  readonly raw: string;
  readonly upper: string;
  readonly line: number;
  readonly col: number;
}

const TOKEN_SPLIT_RE = /[\s,;:]+|(?<![<>])=(?![<>=])/;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const lines = text.split(/\r?\n/);
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const line = lines[lineIdx] ?? '';
    const parts = line.split(TOKEN_SPLIT_RE);
    let col = 0;
    for (const part of parts) {
      if (part === '') { col += 1; continue; }
      const found = line.indexOf(part, col);
      if (found >= 0) col = found;
      tokens.push({ raw: part, upper: part.toUpperCase().replace(/[^A-Z0-9./-]/g, ''), line: lineIdx, col });
      col += part.length;
    }
  }
  return tokens;
}

function splitToken(raw: string): { base: string; suffix: string } | null {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length === 0) return null;
  const suffixMatch = cleaned.match(/([a-z]{1,3})$/);
  const suffix = suffixMatch?.[1] ?? '';
  const base = suffix.length > 0 ? cleaned.slice(0, -suffix.length) : cleaned;
  if (base.length === 0) return null;
  return { base, suffix };
}

function isForexPair(base: string): boolean {
  if (!/^[A-Z]{6}$/.test(base)) return false;
  return CURRENCY_CODES.has(base.slice(0, 3)) && CURRENCY_CODES.has(base.slice(3, 6));
}

function isCryptoPair(base: string): boolean {
  if (!/^[A-Z]{3,8}$/.test(base)) return false;
  for (const quote of CRYPTO_QUOTES) {
    if (base.length <= quote.length) continue;
    if (base.endsWith(quote)) {
      const head = base.slice(0, base.length - quote.length);
      if (CRYPTO_BASES.has(head)) return true;
    }
  }
  return false;
}

function isIndexOrCommodity(base: string): boolean {
  const m = base.match(/^([A-Z]{2,4})(\d{2,4})$/);
  if (m === null) return false;
  const prefix = m[1];
  if (prefix === undefined) return false;
  return INDEX_PREFIXES.has(prefix);
}

function canonicalSymbol(base: string, suffix: string): string {
  const upperBase = base.toUpperCase();
  const alias = SYMBOL_ALIASES[upperBase];
  if (alias !== undefined) return suffix.length > 0 ? `${alias}${suffix}` : alias;
  return suffix.length > 0 ? `${base}${suffix}` : base;
}

function detectSymbol(tokens: Token[]): string | null {
  for (const t of tokens) {
    const cleaned = t.raw.replace(/[^A-Za-z0-9]/g, '');
    if (cleaned.length === 0) continue;
    if (RESERVED_WORDS.has(cleaned.toUpperCase())) continue;
    const split = splitToken(t.raw);
    if (split === null) continue;
    const { base, suffix } = split;
    if (!/^[A-Z0-9]+$/.test(base)) continue;
    if (SYMBOL_ALIASES[base] !== undefined) return canonicalSymbol(base, suffix);
    if (isForexPair(base) || isCryptoPair(base) || isIndexOrCommodity(base)) return canonicalSymbol(base, suffix);
  }
  return null;
}

function detectDirection(tokens: Token[]): ParsedDirection | null {
  for (const t of tokens) {
    if (t.upper === 'BUY' || t.upper === 'LONG') return 'BUY';
    if (t.upper === 'SELL' || t.upper === 'SHORT') return 'SELL';
  }
  return null;
}

interface KeywordExtraction {
  readonly values: number[];
  readonly order: number[];
  readonly lines: number[];
}

function matchKeyword(tokenUpper: string, baseKeywords: ReadonlyArray<string>): number | null {
  for (const kw of baseKeywords) {
    if (tokenUpper === kw) return 0;
    if (tokenUpper.length === kw.length + 1 && tokenUpper.startsWith(kw)) {
      const last = tokenUpper.charAt(kw.length);
      if (last >= '1' && last <= '9') return Number.parseInt(last, 10);
    }
  }
  return null;
}

const SL_BASE: ReadonlyArray<string> = ['SL', 'STOPLOSS', 'STOP'];
const TP_BASE: ReadonlyArray<string> = ['TP', 'TARGET', 'TAKEPROFIT'];
const ENTRY_BASE: ReadonlyArray<string> = ['ENTRY', 'ENTRYPRICE'];

function findKeyword(tokens: Token[], baseKeywords: ReadonlyArray<string>): KeywordExtraction {
  const values: number[] = [];
  const order: number[] = [];
  const lines: number[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === undefined) continue;
    const suffix = matchKeyword(t.upper, baseKeywords);
    if (suffix === null) continue;

    let j = i + 1;
    let sawValue = false;
    let localIndex = 0;
    while (j < tokens.length) {
      const next = tokens[j];
      if (next === undefined) break;
      if (next.line !== t.line) break;
      const n = parseNumber(next.raw);
      if (n !== null) {
        values.push(n);
        order.push(suffix === 0 ? 0 : suffix * 10 + localIndex);
        localIndex += 1;
        sawValue = true;
        j += 1;
        continue;
      }
      if (/^[:@\-=/]$/.test(next.raw)) { j += 1; continue; }
      break;
    }
    if (sawValue) lines.push(t.line);
  }
  return { values, order, lines };
}

function findPositionalEntry(tokens: Token[], symbol: string | null, direction: ParsedDirection | null, consumedLines: ReadonlySet<number>): number | null {
  if (symbol === null && direction === null) return null;
  const symbolUpper = symbol !== null ? symbol.toUpperCase() : null;
  const directionUpper = direction !== null ? direction.toUpperCase() : null;

  let anchorLine: number | null = null;
  for (const t of tokens) {
    const matchesSymbol = symbolUpper !== null && t.upper === symbolUpper;
    const matchesDirection = directionUpper !== null && t.upper === directionUpper;
    if (matchesSymbol || matchesDirection) {
      if (anchorLine === null || t.line < anchorLine) anchorLine = t.line;
    }
  }
  if (anchorLine === null) return null;
  if (consumedLines.has(anchorLine)) return null;

  for (const t of tokens) {
    if (t.line !== anchorLine) continue;
    const n = parseNumber(t.raw);
    if (n !== null) return n;
  }
  return null;
}

export function parseSignal(rawText: string): ParsedSignal {
  const warnings: ParseWarning[] = [];

  if (typeof rawText !== 'string') {
    return { status: 'EMPTY', symbol: null, direction: null, entry: null, sl: null, tp: null, tpLevels: [], warnings: [{ code: 'NON_STRING_INPUT', message: 'Input not a string.' }], rawText: String(rawText) };
  }

  const trimmed = rawText.trim();
  if (trimmed === '') {
    return { status: 'EMPTY', symbol: null, direction: null, entry: null, sl: null, tp: null, tpLevels: [], warnings: [], rawText };
  }

  const tokens = tokenize(trimmed);
  const symbol = detectSymbol(tokens);
  const direction = detectDirection(tokens);
  const slExtraction = findKeyword(tokens, SL_BASE);
  const tpExtraction = findKeyword(tokens, TP_BASE);
  const entryExtraction = findKeyword(tokens, ENTRY_BASE);

  let sl: number | null = null;
  if (slExtraction.values.length === 0) {
    warnings.push({ code: 'SL_MISSING', message: 'No SL value.' });
  } else if (slExtraction.values.length > 1) {
    warnings.push({ code: 'SL_MULTIPLE', message: `Multiple SL (${slExtraction.values.length}); using first.` });
    sl = slExtraction.values[0] ?? null;
  } else {
    sl = slExtraction.values[0] ?? null;
  }

  const tpPairs = tpExtraction.values.map((v, idx) => ({ value: v, order: tpExtraction.order[idx] ?? 0, appearance: idx }));
  tpPairs.sort((a, b) => a.order !== b.order ? a.order - b.order : a.appearance - b.appearance);
  const tpLevels: number[] = tpPairs.map((p) => p.value);

  let tp: number | null = null;
  if (tpLevels.length === 0) warnings.push({ code: 'TP_MISSING', message: 'No TP value.' });
  else tp = tpLevels[0] ?? null;

  let entry: number | null = null;
  const consumedLines = new Set<number>([...slExtraction.lines, ...tpExtraction.lines, ...entryExtraction.lines]);

  if (entryExtraction.values.length > 0) {
    entry = entryExtraction.values[0] ?? null;
    if (entryExtraction.values.length > 1) warnings.push({ code: 'ENTRY_MULTIPLE', message: `Multiple entry (${entryExtraction.values.length}); using first.` });
  } else {
    const positional = findPositionalEntry(tokens, symbol, direction, consumedLines);
    if (positional !== null) entry = positional;
    else warnings.push({ code: 'ENTRY_MISSING', message: 'No entry value found.' });
  }

  const requiredPresent = symbol !== null && direction !== null && entry !== null && sl !== null && tp !== null;

  if (!requiredPresent) {
    return { status: 'INVALID', symbol, direction, entry, sl, tp, tpLevels, warnings, rawText };
  }

  return { status: 'OK', symbol, direction, entry, sl, tp, tpLevels, warnings, rawText };
}
