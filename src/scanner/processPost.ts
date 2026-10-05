import { withTransaction } from '../db/client';
import { computeRr } from '../parser/rrEngine';
import { parseSignal } from '../parser/signalParser';
import { insertPost } from '../services/postService';
import { insertSignal } from '../services/signalService';
import { InsertSignalInput, SignalStatus } from '../services/types';
import { PostProcessResult } from './types';

export interface ProcessPostInput {
  readonly channelId: number;
  readonly username: string;
  readonly messageId: string;
  readonly messageText: string;
  readonly postedAt: Date | null;
  readonly rawHtmlHash: string | null;
  readonly minRrThreshold: number;
}

export async function processPost(input: ProcessPostInput): Promise<PostProcessResult> {
  const base = {
    channelId: input.channelId,
    username: input.username,
    messageId: input.messageId,
  } as const;

  if (input.messageText.trim() === '') {
    return { ...base, outcome: 'skipped', parserStatus: null, rrStatus: null, signalStatus: null, error: null };
  }

  const parsed = parseSignal(input.messageText);

  if (parsed.status !== 'OK') {
    try {
      return await withTransaction(async (client) => {
        const postResult = await insertPost(
          {
            channel_id: input.channelId,
            message_id: input.messageId,
            message_text: input.messageText,
            posted_at: input.postedAt,
            raw_html_hash: input.rawHtmlHash,
          },
          client
        );
        if (!postResult.ok) throw new Error(`insertPost failed: ${postResult.error.message}`);
        if (postResult.value.outcome === 'duplicate') {
          return { ...base, outcome: 'duplicate_post' as const, parserStatus: parsed.status, rrStatus: null, signalStatus: null, error: null };
        }
        return { ...base, outcome: 'inserted_post_only' as const, parserStatus: parsed.status, rrStatus: null, signalStatus: null, error: null };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ...base, outcome: 'transaction_rolled_back', parserStatus: parsed.status, rrStatus: null, signalStatus: null, error: message };
    }
  }

  const rrResult = computeRr({
    direction: parsed.direction,
    entry: parsed.entry,
    sl: parsed.sl,
    tp: parsed.tp,
    threshold: input.minRrThreshold,
  });

  const signalStatus: SignalStatus =
    rrResult.status === 'READY' ? 'READY' :
    rrResult.status === 'BELOW_2R' ? 'BELOW_2R' : 'INVALID';

  const signalInput: InsertSignalInput = {
    channel_id: input.channelId,
    message_id: input.messageId,
    symbol: parsed.symbol,
    direction: parsed.direction,
    entry: parsed.entry,
    sl: parsed.sl,
    tp: parsed.tp,
    tp_levels: parsed.tpLevels.length > 0 ? parsed.tpLevels : null,
    risk: rrResult.risk,
    reward: rrResult.reward,
    rr: rrResult.rr,
    status: signalStatus,
    original_text: parsed.rawText,
    posted_at: input.postedAt,
  };

  try {
    return await withTransaction(async (client) => {
      const postResult = await insertPost(
        {
          channel_id: input.channelId,
          message_id: input.messageId,
          message_text: input.messageText,
          posted_at: input.postedAt,
          raw_html_hash: input.rawHtmlHash,
        },
        client
      );
      if (!postResult.ok) throw new Error(`insertPost failed: ${postResult.error.message}`);
      if (postResult.value.outcome === 'duplicate') {
        return { ...base, outcome: 'duplicate_post' as const, parserStatus: parsed.status, rrStatus: rrResult.status, signalStatus: null, error: null };
      }
      const signalResult = await insertSignal(signalInput, client);
      if (!signalResult.ok) throw new Error(`insertSignal failed: ${signalResult.error.message}`);
      if (signalResult.value.outcome === 'duplicate') {
        return { ...base, outcome: 'duplicate_signal' as const, parserStatus: parsed.status, rrStatus: rrResult.status, signalStatus: signalResult.value.existing.status, error: null };
      }
      return { ...base, outcome: 'inserted_signal' as const, parserStatus: parsed.status, rrStatus: rrResult.status, signalStatus: signalResult.value.row.status, error: null };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, outcome: 'transaction_rolled_back', parserStatus: parsed.status, rrStatus: rrResult.status, signalStatus: null, error: message };
  }
}
