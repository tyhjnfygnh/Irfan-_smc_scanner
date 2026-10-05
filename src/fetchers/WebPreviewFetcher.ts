import * as crypto from 'crypto';
import { getConfig } from '../config/env';
import { ChannelFetcher, FetchedPost, FetchResult } from './types';

const USER_AGENT = 'Mozilla/5.0 (compatible; IrfanXauLab/0.1; +https://t.me/)';

export class WebPreviewFetcher implements ChannelFetcher {
  public readonly name = 'web-preview';

  async fetch(username: string): Promise<FetchResult> {
    const cfg = getConfig();
    const started = Date.now();
    const fetchedAt = new Date();
    const url = `https://t.me/s/${encodeURIComponent(username)}`;

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.scanner.fetchTimeoutMs);
      try {
        res = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal,
          redirect: 'follow',
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { outcome: 'network_error', httpStatus: null, posts: [], error: message, durationMs: Date.now() - started, fetchedAt };
    }

    const httpStatus = res.status;

    if (httpStatus === 429) return { outcome: 'rate_limited', httpStatus, posts: [], error: 'HTTP 429', durationMs: Date.now() - started, fetchedAt };
    if (httpStatus === 403) return { outcome: 'forbidden', httpStatus, posts: [], error: 'HTTP 403', durationMs: Date.now() - started, fetchedAt };
    if (httpStatus === 404) return { outcome: 'not_found', httpStatus, posts: [], error: 'HTTP 404', durationMs: Date.now() - started, fetchedAt };
    if (httpStatus >= 500) return { outcome: 'server_error', httpStatus, posts: [], error: `HTTP ${httpStatus}`, durationMs: Date.now() - started, fetchedAt };
    if (!res.ok) return { outcome: 'server_error', httpStatus, posts: [], error: `HTTP ${httpStatus}`, durationMs: Date.now() - started, fetchedAt };

    let html: string;
    try {
      html = await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { outcome: 'network_error', httpStatus, posts: [], error: `Read body failed: ${message}`, durationMs: Date.now() - started, fetchedAt };
    }

    const posts = parseTelegramWebPreview(html);

    if (posts.length === 0) {
      return { outcome: 'empty', httpStatus, posts: [], error: 'No posts found (web preview may be disabled)', durationMs: Date.now() - started, fetchedAt };
    }

    return { outcome: 'ok', httpStatus, posts, error: null, durationMs: Date.now() - started, fetchedAt };
  }
}

function parseTelegramWebPreview(html: string): FetchedPost[] {
  const posts: FetchedPost[] = [];
  const seen = new Set<string>();
  const postRegex = /data-post="([^"/]+)\/(\d+)"/g;
  const matches: Array<{ username: string; id: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = postRegex.exec(html)) !== null) {
    const username = m[1];
    const id = m[2];
    if (username === undefined || id === undefined) continue;
    matches.push({ username, id, index: m.index });
  }

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    if (match === undefined) continue;
    const nextIndex = i + 1 < matches.length && matches[i + 1] !== undefined ? matches[i + 1]!.index : html.length;
    const segment = html.slice(match.index, nextIndex);
    const key = `${match.username}/${match.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const text = extractPostText(segment);
    const postedAt = extractPostTime(segment);
    const rawHtmlHash = crypto.createHash('sha256').update(segment).digest('hex');

    if (text === null || text.trim() === '') continue;

    posts.push({ messageId: match.id, text: text.trim(), postedAt, rawHtmlHash });
  }

  posts.sort((a, b) => {
    const ai = Number.parseInt(a.messageId, 10);
    const bi = Number.parseInt(b.messageId, 10);
    if (!Number.isFinite(ai) || !Number.isFinite(bi)) return 0;
    return bi - ai;
  });

  return posts;
}

function extractPostText(segment: string): string | null {
  const textClassRe = /<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/;
  const match = segment.match(textClassRe);
  if (!match || match[1] === undefined) return null;
  return stripHtml(match[1]);
}

function extractPostTime(segment: string): Date | null {
  const timeRe = /<time[^>]*datetime="([^"]+)"/;
  const match = segment.match(timeRe);
  if (!match || match[1] === undefined) return null;
  const d = new Date(match[1]);
  return Number.isFinite(d.getTime()) ? d : null;
}

function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
