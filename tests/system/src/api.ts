import { API_URL, MAILPIT_URL } from './env.ts';

export interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  headers: Headers;
  body: T;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string };
}

type Json = Record<string, unknown>;

/**
 * Minimal client for the gateway. Requests answered 429 by the login rate limit (10 per minute
 * per IP) wait for `Retry-After` and are repeated once, so the checks can be re-run back to back.
 */
export async function api<T = Json>(
  method: string,
  path: string,
  options: { token?: string; json?: unknown; form?: FormData } = {},
): Promise<ApiResponse<T>> {
  for (let attempt = 1; ; attempt++) {
    const headers: Record<string, string> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    let body: string | FormData | undefined;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form) {
      body = options.form;
    }
    const res = await fetch(`${API_URL}${path}`, { method, headers, body });
    if (res.status === 429 && attempt === 1) {
      const wait = Math.min(Number(res.headers.get('retry-after') ?? '60'), 90);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    const text = await res.text();
    const parsed = (text ? JSON.parse(text) : {}) as T;
    return { status: res.status, headers: res.headers, body: parsed };
  }
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await api<Session>('POST', '/auth/login', { json: { email, password } });
  if (res.status !== 200) throw new Error(`login ${email} → ${res.status}`);
  return res.body;
}

// ------------------------------------------------------------------ Mailpit

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

export interface Email {
  id: string;
  subject: string;
  text: string;
  html: string;
}

async function mailpitSearch(query: string): Promise<MailpitSummary[]> {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?limit=200&query=${encodeURIComponent(query)}`,
  );
  if (!res.ok) throw new Error(`Mailpit → ${res.status}`);
  return ((await res.json()) as { messages: MailpitSummary[] | null }).messages ?? [];
}

/** Waits for an email to `to` whose subject matches, as delivered by the notification-service. */
export async function waitForEmail(
  to: string,
  subject: RegExp,
  timeoutMs = 20_000,
): Promise<Email> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await mailpitSearch(`to:"${to}"`)).find(
      (m) =>
        m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()) && subject.test(m.Subject),
    );
    if (found) {
      const res = await fetch(`${MAILPIT_URL}/api/v1/message/${found.ID}`);
      const detail = (await res.json()) as { Subject: string; Text: string; HTML: string };
      return { id: found.ID, subject: detail.Subject, text: detail.Text, html: detail.HTML };
    }
    if (Date.now() > deadline) throw new Error(`nenhum email para ${to} com assunto ${subject}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Deletes every email sent to an address of the given domain. Returns how many. */
export async function deleteEmailsTo(domain: string): Promise<number> {
  const ids = (await mailpitSearch(`to:"${domain}"`))
    .filter((m) => m.To.some((t) => t.Address.toLowerCase().endsWith(`@${domain}`)))
    .map((m) => m.ID);
  if (ids.length > 0) {
    await fetch(`${MAILPIT_URL}/api/v1/messages`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ IDs: ids }),
    });
  }
  return ids.length;
}
