export type ParsedDirection = 'BUY' | 'SELL';
export type ParseStatus = 'OK' | 'INVALID' | 'EMPTY';

export interface ParseWarning {
  readonly code: string;
  readonly message: string;
}

export interface ParsedSignal {
  readonly status: ParseStatus;
  readonly symbol: string | null;
  readonly direction: ParsedDirection | null;
  readonly entry: number | null;
  readonly sl: number | null;
  readonly tp: number | null;
  readonly tpLevels: ReadonlyArray<number>;
  readonly warnings: ReadonlyArray<ParseWarning>;
  readonly rawText: string;
}

export type RrStatus = 'READY' | 'BELOW_2R' | 'INVALID';

export interface RrResult {
  readonly status: RrStatus;
  readonly risk: number | null;
  readonly reward: number | null;
  readonly rr: number | null;
  readonly threshold: number;
  readonly reason: string | null;
}
