export type FetchOutcome =
  | 'ok'
  | 'empty'
  | 'not_found'
  | 'rate_limited'
  | 'forbidden'
  | 'server_error'
  | 'network_error'
  | 'parse_error';

export interface FetchedPost {
  readonly messageId: string;
  readonly text: string;
  readonly postedAt: Date | null;
  readonly rawHtmlHash: string | null;
}

export interface FetchResult {
  readonly outcome: FetchOutcome;
  readonly httpStatus: number | null;
  readonly posts: ReadonlyArray<FetchedPost>;
  readonly error: string | null;
  readonly durationMs: number;
  readonly fetchedAt: Date;
}

export interface ChannelFetcher {
  readonly name: string;
  fetch(username: string): Promise<FetchResult>;
}
