import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private isConfigured() {
    return !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM
    );
  }

  async sendMagicLink(params: { to: string; subject: string; url: string; context?: Record<string, unknown> }) {
    const { to, subject, url, context } = params;

    if (!to?.trim()) {
      this.logger.warn('sendMagicLink called without recipient');
      return { ok: false as const, skipped: true as const, reason: 'missing-recipient' };
    }

    if (!this.isConfigured()) {
      // Dev-safe behavior: don’t block scheduling if SMTP isn’t configured.
      this.logger.warn(`SMTP not configured; magic link for ${to}: ${url}`);
      if (context) this.logger.debug({ context }, 'magic link context');
      return { ok: true as const, skipped: true as const };
    }

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const from = process.env.SMTP_FROM!;

    const text = `${subject}\n\nOpen this link to start your interview:\n${url}\n\nIf you didn’t expect this email, please ignore it.`;
    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.45">
        <h2 style="margin:0 0 12px 0; font-weight:600">${escapeHtml(subject)}</h2>
        <p style="margin:0 0 12px 0">Open this link to start your interview:</p>
        <p style="margin:0 0 16px 0"><a href="${escapeAttr(url)}">${escapeHtml(url)}</a></p>
        <p style="margin:0; color:#666">If you didn’t expect this email, please ignore it.</p>
      </div>
    `.trim();

    await transport.sendMail({ from, to, subject, text, html });
    return { ok: true as const, skipped: false as const };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}
