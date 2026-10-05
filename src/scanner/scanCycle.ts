import { getConfig } from '../config/env';
import { probeChannel } from '../fetchers/probe';
import { insertScanLog } from '../services/scanLogService';
import { listEnabledChannels } from '../services/channelService';
import { ChannelRow } from '../services/types';
import { processPost } from './processPost';
import { ChannelScanResult, PostProcessResult, ScanCycleResult } from './types';

const RETRYABLE_OUTCOMES = new Set(['network_error', 'server_error', 'rate_limited']);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeWithRetry(channelId: number, username: string, maxRetries: number, backoffBaseMs: number) {
  let attempt = 0;
  let lastResult = await probeChannel(channelId, username);
  while (attempt < maxRetries && RETRYABLE_OUTCOMES.has(lastResult.outcome)) {
    attempt += 1;
    const wait = backoffBaseMs * attempt;
    await delay(wait);
    lastResult = await probeChannel(channelId, username);
  }
  return lastResult;
}

async function scanOneChannel(
  channel: ChannelRow,
  minRrThreshold: number,
  maxRetries: number,
  backoffBaseMs: number
): Promise<ChannelScanResult> {
  const probe = await probeWithRetry(channel.id, channel.username, maxRetries, backoffBaseMs);
  const postResults: PostProcessResult[] = [];
  let postsNew = 0;
  let signalsNew = 0;
  let duplicates = 0;
  for (const post of probe.posts) {
    const result = await processPost({
      channelId: channel.id,
      username: channel.username,
      messageId: post.messageId,
      messageText: post.text,
      postedAt: post.postedAt,
      rawHtmlHash: post.rawHtmlHash,
      minRrThreshold,
    });
    postResults.push(result);
    switch (result.outcome) {
      case 'inserted_signal':
        postsNew += 1;
        signalsNew += 1;
        break;
      case 'inserted_post_only':
        postsNew += 1;
        break;
      case 'duplicate_post':
      case 'duplicate_signal':
        duplicates += 1;
        break;
      default:
        break;
    }
  }
  return {
    channelId: channel.id,
    username: channel.username,
    fetchOutcome: probe.outcome,
    fetchHttpStatus: probe.httpStatus,
    fetchError: probe.error,
    fetchDurationMs: probe.durationMs,
    postsSeen: probe.posts.length,
    postsProcessed: postResults.length,
    postsNew,
    signalsNew,
    duplicates,
    postResults,
  };
}

export async function runScanCycle(): Promise<ScanCycleResult> {
  const cfg = getConfig();
  const startedAt = new Date();
  const channelsResult = await listEnabledChannels();
  if (!channelsResult.ok) {
    const finishedAt = new Date();
    return {
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      channelsAttempted: 0,
      channelsSucceeded: 0,
      channelsFailed: 0,
      totalNewPosts: 0,
      totalNewSignals: 0,
      channelResults: [],
      cycleLevelError: `Failed to load enabled channels: ${channelsResult.error.message}`,
    };
  }
  const channels = channelsResult.value;
  const channelResults: ChannelScanResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let totalNewPosts = 0;
  let totalNewSignals = 0;
  for (const channel of channels) {
    try {
      const result = await scanOneChannel(
        channel,
        cfg.minRrThreshold,
        cfg.scanner.fetchMaxRetries,
        cfg.scanner.fetchBackoffBaseMs
      );
      channelResults.push(result);
      totalNewPosts += result.postsNew;
      totalNewSignals += result.signalsNew;
      const isSuccess = result.fetchOutcome === 'ok' || result.fetchOutcome === 'empty';
      if (isSuccess) succeeded += 1;
      else failed += 1;
      await insertScanLog({
        channel_id: channel.id,
        scan_type: 'auto',
        status: isSuccess ? 'success' : 'error',
        posts_found: result.postsSeen,
        new_signals: result.signalsNew,
        error_message: result.fetchError,
        duration_ms: result.fetchDurationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed += 1;
      channelResults.push({
        channelId: channel.id,
        username: channel.username,
        fetchOutcome: 'network_error',
        fetchHttpStatus: null,
        fetchError: message,
        fetchDurationMs: 0,
        postsSeen: 0,
        postsProcessed: 0,
        postsNew: 0,
        signalsNew: 0,
        duplicates: 0,
        postResults: [],
      });
    }
  }
  const finishedAt = new Date();
  return {
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    channelsAttempted: channels.length,
    channelsSucceeded: succeeded,
    channelsFailed: failed,
    totalNewPosts,
    totalNewSignals,
    channelResults,
    cycleLevelError: null,
  };
}
