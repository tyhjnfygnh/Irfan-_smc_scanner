export type SignalLifecycleStatus =
  | 'DETECTED'      // Raw post received from Telegram
  | 'PARSED'        // BUY/SELL + symbol + entry + SL + TP extracted
  | 'RR_VERIFIED'   // RR calculated, ≥1:2 check done
  | 'READY'         // Real READY signal - actual Telegram + parsed + RR≥2 verified
  | 'INVALID'       // Incomplete / invalid data
  | 'REJECTED';     // Duplicate or below RR threshold

export interface LifecycleTransition {
  readonly from: SignalLifecycleStatus | null;
  readonly to: SignalLifecycleStatus;
  readonly reason: string;
  readonly timestamp: Date;
}

export function determineStatus(input: {
  hasRawText: boolean;
  parsedOk: boolean;
  rr: number | null;
  isDuplicate: boolean;
  minRr: number;
}): { status: SignalLifecycleStatus; reason: string } {
  if (!input.hasRawText) {
    return { status: 'INVALID', reason: 'No raw text from Telegram' };
  }
  if (input.isDuplicate) {
    return { status: 'REJECTED', reason: 'Duplicate signal - already counted' };
  }
  if (!input.parsedOk) {
    return { status: 'INVALID', reason: 'BUY/SELL + symbol + entry + SL + TP parse failed' };
  }
  // Parsed ok
  if (input.rr === null) {
    return { status: 'PARSED', reason: 'Parsed but RR not calculable' };
  }
  if (input.rr < input.minRr) {
    return { status: 'RR_VERIFIED', reason: `RR ${input.rr.toFixed(2)} < ${input.minRr} threshold - below 1:2` };
  }
  // Real READY - actual Telegram + parsed + RR≥2 verified
  return { status: 'READY', reason: `READY - Real Telegram message + parsed + RR ${input.rr.toFixed(2)} ≥ ${input.minRr} verified` };
}

export function isReadySignal(status: SignalLifecycleStatus): boolean {
  return status === 'READY';
}
