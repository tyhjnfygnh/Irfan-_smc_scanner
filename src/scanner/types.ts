import { FetchOutcome } from '../fetchers/types';
import { RrStatus } from '../parser/types';
import { SignalStatus } from '../services/types';

export type PostProcessOutcome =
  | 'inserted_signal'
  | 'inserted_post_only'
  | 'duplicate_post'
  | 'duplicate_signal'
  | 'transaction_rolled_back'
  | 'skipped';

export interface PostProcessResult {
  readonly channelId: number;
  readonly username: string;
  readonly messageId: string;
  readonly outcome: PostProcessOutcome;
  readonly parserStatus: 'OK' | 'INVALID' | 'EMPTY' | null;
  readonly rrStatus: RrStatus | null;
  readonly signalStatus: SignalStatus | null;
  readonly error: string | null;
}

export interface ChannelScanResult {
  readonly channelId: number;
  readonly username: string;
  readonly fetchOutcome: FetchOutcome;
  readonly fetchHttpStatus: number | null;
  readonly fetchError: string | null;
  readonly fetchDurationMs: number;
  readonly postsSeen: number;
  readonly postsProcessed: number;
  readonly postsNew: number;
  readonly signalsNew: number;
  readonly duplicates: number;
  readonly postResults: ReadonlyArray<PostProcessResult>;
}

export interface ScanCycleResult {
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly channelsAttempted: number;
  readonly channelsSucceeded: number;
  readonly channelsFailed: number;
  readonly totalNewPosts: number;
  readonly totalNewSignals: number;
  readonly channelResults: ReadonlyArray<ChannelScanResult>;
  readonly cycleLevelError: string | null;
}

export interface SchedulerState {
  readonly running: boolean;
  readonly intervalMs: number;
  readonly lastCycleAt: Date | null;
  readonly nextCycleAt: Date | null;
  readonly lastCycleResult: ScanCycleResult | null;
  readonly lastCycleError: string | null;
}
