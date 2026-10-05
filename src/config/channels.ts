// 7 Public Telegram Signal Channels - Expandable
export interface ChannelConfig {
  readonly username: string;
  readonly display_name: string;
  readonly is_enabled: boolean;
  readonly priority: number; // 1=high, 3=low
}

export const DEFAULT_CHANNELS: ReadonlyArray<ChannelConfig> = [
  { username: 'tradewithmahak', display_name: 'Trade With Mahak', is_enabled: true, priority: 1 },
  { username: 'goldsignalsdaily', display_name: 'Gold Signals Daily', is_enabled: true, priority: 1 },
  { username: 'forexsignalspro', display_name: 'Forex Signals Pro', is_enabled: true, priority: 2 },
  { username: 'xauusd_signals', display_name: 'XAUUSD Signals', is_enabled: true, priority: 1 },
  { username: 'btc_signals_zone', display_name: 'BTC Signals Zone', is_enabled: true, priority: 2 },
  { username: 'forex_gold_signals', display_name: 'Forex Gold Signals', is_enabled: true, priority: 2 },
  { username: 'premiumforexsignals', display_name: 'Premium Forex', is_enabled: true, priority: 3 },
];

export function getEnabledChannels(): ChannelConfig[] {
  return DEFAULT_CHANNELS.filter(c => c.is_enabled);
}

export function validateChannelUsername(username: string): string | null {
  const clean = username.trim().replace(/^@+/, '').toLowerCase();
  if (clean.length === 0) return 'Username empty';
  if (clean.length > 64) return 'Too long';
  if (/\s/.test(clean)) return 'No spaces allowed';
  if (!/^[a-z0-9_]+$/.test(clean)) return 'Only a-z, 0-9, underscore';
  return null;
}
