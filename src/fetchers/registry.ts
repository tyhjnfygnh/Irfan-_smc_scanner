import { ChannelFetcher } from './types';
import { WebPreviewFetcher } from './WebPreviewFetcher';

class FetcherRegistry {
  private readonly fetchers: ChannelFetcher[] = [];

  constructor() {
    this.register(new WebPreviewFetcher());
  }

  register(fetcher: ChannelFetcher): void {
    this.fetchers.push(fetcher);
  }

  getDefault(): ChannelFetcher {
    const first = this.fetchers[0];
    if (first === undefined) throw new Error('[fetchers] No fetcher registered.');
    return first;
  }

  list(): ReadonlyArray<string> {
    return this.fetchers.map((f) => f.name);
  }
}

export const fetcherRegistry = new FetcherRegistry();
