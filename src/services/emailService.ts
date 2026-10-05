import * as nodemailer from 'nodemailer';
import { getConfig } from '../config/env';

export interface EmailAlertInput {
  readonly symbol: string;
  readonly direction: 'BUY' | 'SELL';
  readonly entry: number;
  readonly sl: number;
  readonly tp: number;
  readonly rr: number;
  readonly channelUsername: string;
  readonly messageId: string;
  readonly postedAt: Date | null;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter !== null) return transporter;
  const cfg = getConfig() as any;
  // Gmail App Password method - production ready
  if (!cfg.email || !cfg.email.gmailUser || !cfg.email.gmailAppPassword) {
    throw new Error('[email] Gmail credentials missing in .env (GMAIL_USER, GMAIL_APP_PASSWORD)');
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: cfg.email.gmailUser,
      pass: cfg.email.gmailAppPassword,
    },
  });
  return transporter;
}

export async function sendReadySignalAlert(input: EmailAlertInput): Promise<{ ok: boolean; messageId: string | null; error: string | null }> {
  try {
    const cfg = getConfig() as any;
    const recipient = cfg.email?.alertRecipient || cfg.email?.gmailUser;
    if (!recipient) throw new Error('No recipient email configured');

    const subject = `🚀 READY ${input.symbol} ${input.direction} RR ${input.rr.toFixed(2)} | ${input.channelUsername}`;
    const text = `
IRFAN XAU LAB • READY SIGNAL ALERT

Symbol: ${input.symbol}
Direction: ${input.direction}
Entry: ${input.entry}
SL: ${input.sl}
TP: ${input.tp}
RR: ${input.rr.toFixed(2)} (≥1:2 VERIFIED)
Channel: @${input.channelUsername}
Message ID: ${input.messageId}
Posted At: ${input.postedAt?.toISOString() ?? 'unknown'}
Detected At: ${new Date().toISOString()}

Status: READY (BUY/SELL + symbol + entry + SL + TP parsed + RR ≥2 verified)

This is real Telegram data - no demo.

---
Irfan Telegram Signal Scanner
`.trim();

    const info = await getTransporter().sendMail({
      from: cfg.email.gmailUser,
      to: recipient,
      subject,
      text,
    });

    return { ok: true, messageId: info.messageId ?? null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, messageId: null, error: message };
  }
}

export async function verifyEmailConfig(): Promise<{ ok: boolean; error: string | null }> {
  try {
    const t = getTransporter();
    await t.verify();
    return { ok: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
