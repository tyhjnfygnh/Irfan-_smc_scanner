import { ParsedDirection, RrResult } from './types';

export interface ComputeRrInput {
  readonly direction: ParsedDirection | null;
  readonly entry: number | null;
  readonly sl: number | null;
  readonly tp: number | null;
  readonly threshold?: number;
}

export function computeRr(input: ComputeRrInput): RrResult {
  const threshold = input.threshold ?? 2.0;

  if (!Number.isFinite(threshold) || threshold <= 0) {
    return { status: 'INVALID', risk: null, reward: null, rr: null, threshold, reason: 'Threshold must be positive finite.' };
  }

  const { direction, entry, sl, tp } = input;

  if (direction === null) return { status: 'INVALID', risk: null, reward: null, rr: null, threshold, reason: 'Direction missing.' };
  if (entry === null || sl === null || tp === null) return { status: 'INVALID', risk: null, reward: null, rr: null, threshold, reason: 'Entry/SL/TP missing.' };
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp)) return { status: 'INVALID', risk: null, reward: null, rr: null, threshold, reason: 'Entry/SL/TP not finite.' };

  let risk: number;
  let reward: number;
  if (direction === 'SELL') {
    risk = sl - entry;
    reward = entry - tp;
  } else {
    risk = entry - sl;
    reward = tp - entry;
  }

  if (risk <= 0) return { status: 'INVALID', risk: null, reward: null, rr: null, threshold, reason: `Risk not positive (${risk}).` };
  if (reward <= 0) return { status: 'INVALID', risk: null, reward: null, rr: null, threshold, reason: `Reward not positive (${reward}).` };

  const rr = reward / risk;
  if (!Number.isFinite(rr) || rr <= 0) return { status: 'INVALID', risk: null, reward: null, rr: null, threshold, reason: `RR not positive (${rr}).` };

  const status = rr >= threshold ? 'READY' : 'BELOW_2R';
  return { status, risk, reward, rr, threshold, reason: null };
}
