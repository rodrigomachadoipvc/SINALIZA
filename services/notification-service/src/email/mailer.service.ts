import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { NOTIFICATION_CONFIG, type NotificationConfig } from '../config.js';
import type { EmailMessage } from './templates.js';

const VERIFY_CACHE_MS = 30_000;

/** SMTP delivery with Nodemailer (Mailpit locally; SendGrid or Mailtrap in the cloud). */
@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly transport: Transporter;
  private lastCheck: { at: number; ok: boolean } | null = null;

  constructor(@Inject(NOTIFICATION_CONFIG) private readonly config: NotificationConfig) {
    const { host, port, secure, user, password } = config.smtp;
    this.transport = createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass: password ?? '' } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: EmailMessage, eventId: string): Promise<void> {
    await this.transport.sendMail({
      from: this.config.mailFrom,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      // Lets support staff match an email to the event that caused it.
      headers: { 'X-Sinaliza-Event-Id': eventId },
    });
  }

  /** SMTP reachability for /health, cached so health checks do not open a connection each time. */
  async isReachable(): Promise<boolean> {
    if (this.lastCheck && Date.now() - this.lastCheck.at < VERIFY_CACHE_MS) {
      return this.lastCheck.ok;
    }
    const ok = await this.transport.verify().then(
      () => true,
      () => false,
    );
    this.lastCheck = { at: Date.now(), ok };
    return ok;
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
