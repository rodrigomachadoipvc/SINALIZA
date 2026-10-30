import { intEnv, rabbitmqUrl } from '@sinaliza/service-kit';

export const NOTIFICATION_CONFIG = Symbol('NOTIFICATION_CONFIG');

export interface SmtpConfig {
  host: string;
  port: number;
  /** true for implicit TLS (port 465); otherwise STARTTLS is used when the server offers it. */
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
}

export interface NotificationConfig {
  port: number;
  rabbitmqUrl: string;
  smtp: SmtpConfig;
  /** `Sinaliza <nao-responder@sinaliza.pt>` */
  mailFrom: string;
  /**
   * Wait before each retry. `[5000, 30000]` means 3 attempts in total: the first delivery and
   * two retries, after 5 s and 30 s. After the last one the message goes to the DLQ.
   */
  retryDelaysMs: number[];
  prefetch: number;
}

type Env = Record<string, string | undefined>;

export function parseDelays(raw: string | undefined, fallback: number[]): number[] {
  if (raw === undefined || raw.trim() === '') return fallback;
  const delays = raw.split(',').map((p) => Number(p.trim()));
  if (delays.some((d) => !Number.isInteger(d) || d <= 0)) {
    throw new Error(`NOTIFICATION_RETRY_DELAYS_MS must be positive integers, got "${raw}"`);
  }
  return delays;
}

export function loadConfig(env: Env = process.env): NotificationConfig {
  return {
    port: intEnv(env, 'PORT', 3004),
    rabbitmqUrl: rabbitmqUrl(env),
    smtp: {
      host: env.SMTP_HOST ?? 'localhost',
      port: intEnv(env, 'SMTP_PORT', 1025),
      secure: env.SMTP_SECURE === 'true',
      user: env.SMTP_USER || undefined,
      password: env.SMTP_PASSWORD || undefined,
    },
    mailFrom: env.MAIL_FROM ?? 'Sinaliza <nao-responder@sinaliza.pt>',
    retryDelaysMs: parseDelays(env.NOTIFICATION_RETRY_DELAYS_MS, [5000, 30000]),
    prefetch: intEnv(env, 'NOTIFICATION_PREFETCH', 10),
  };
}
