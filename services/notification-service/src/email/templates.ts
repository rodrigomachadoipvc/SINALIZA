import {
  type AnyEvent,
  EventType,
  type OccurrenceCreatedPayload,
  type OccurrenceStatus,
  type OccurrenceStatusChangedPayload,
  type PasswordResetRequestedPayload,
  STATUS_LABELS,
  type UserRegisteredPayload,
} from '@sinaliza/shared';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative, for clients that do not show HTML and for screen readers. */
  text: string;
}

const BLUE = '#1A2B4C';
const YELLOW = '#FFC107';
const GREY = '#F4F5F7';
const TEXT = '#1F2933';

/** Every value that comes from an event is escaped: names and notes are user input. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** `30/10/2026, 17:45` in Portuguese time. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Blocks of an email body; each renders to HTML and to plain text. */
type Block =
  | { kind: 'p'; text: string }
  | { kind: 'facts'; rows: Array<[string, string]> }
  | { kind: 'quote'; label: string; text: string }
  | { kind: 'button'; label: string; url: string };

function blockHtml(block: Block): string {
  switch (block.kind) {
    case 'p':
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${TEXT}">${escapeHtml(block.text)}</p>`;
    case 'facts':
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;background:${GREY};border-radius:8px">${block.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 12px;font-size:14px;color:#52606D;width:40%">${escapeHtml(k)}</td><td style="padding:8px 12px;font-size:14px;font-weight:600;color:${TEXT}">${escapeHtml(v)}</td></tr>`,
        )
        .join('')}</table>`;
    case 'quote':
      return `<div style="margin:0 0 16px;padding:12px 16px;border-left:4px solid ${YELLOW};background:#FFF8E1"><p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#52606D">${escapeHtml(block.label)}</p><p style="margin:0;font-size:15px;line-height:1.5;color:${TEXT}">${escapeHtml(block.text)}</p></div>`;
    case 'button':
      return `<p style="margin:8px 0 24px"><a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 24px;background:${YELLOW};color:${BLUE};font-weight:700;font-size:16px;text-decoration:none;border-radius:8px">${escapeHtml(block.label)}</a></p>`;
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case 'p':
      return block.text;
    case 'facts':
      return block.rows.map(([k, v]) => `${k}: ${v}`).join('\n');
    case 'quote':
      return `${block.label}:\n${block.text}`;
    case 'button':
      return `${block.label}: ${block.url}`;
  }
}

const FOOTER =
  'Recebeu este email porque tem conta no Sinaliza, o serviço de ocorrências do concelho de Barcelos. Não responda a esta mensagem.';

function render(to: string, subject: string, title: string, blocks: Block[]): EmailMessage {
  const html = `<!doctype html>
<html lang="pt-PT">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${GREY};font-family:Inter,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${GREY}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden">
<tr><td style="background:${BLUE};padding:20px 24px;border-bottom:4px solid ${YELLOW}"><span style="font-family:Poppins,Inter,Arial,sans-serif;font-size:22px;font-weight:700;color:#FFFFFF">Sinaliza</span><span style="font-size:13px;color:#C9D2E3"> · Barcelos</span></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-family:Poppins,Inter,Arial,sans-serif;font-size:20px;line-height:1.3;color:${BLUE}">${escapeHtml(title)}</h1>
${blocks.map(blockHtml).join('\n')}
</td></tr>
<tr><td style="padding:16px 24px;background:${GREY};font-size:12px;line-height:1.5;color:#52606D">${escapeHtml(FOOTER)}</td></tr>
</table></td></tr></table>
</body>
</html>`;
  const text = [title, '', ...blocks.map(blockText).flatMap((t) => [t, '']), '—', FOOTER].join(
    '\n',
  );
  return { to, subject, html, text };
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

export function welcomeEmail(p: UserRegisteredPayload): EmailMessage {
  return render(p.email, 'Bem-vindo ao Sinaliza', `Olá, ${firstName(p.name)}!`, [
    { kind: 'p', text: 'A sua conta no Sinaliza foi criada.' },
    {
      kind: 'p',
      text: 'Já pode reportar buracos na via, iluminação avariada, resíduos acumulados e outras ocorrências no espaço público do concelho de Barcelos. Vai receber um email sempre que o estado de uma ocorrência sua mudar.',
    },
    { kind: 'p', text: 'Os seus dados nunca são mostrados no mapa público.' },
  ]);
}

export function passwordResetEmail(p: PasswordResetRequestedPayload): EmailMessage {
  return render(p.email, 'Redefinir a palavra-passe do Sinaliza', 'Redefinir a palavra-passe', [
    { kind: 'p', text: `Olá, ${firstName(p.name)}.` },
    {
      kind: 'p',
      text: 'Recebemos um pedido para redefinir a palavra-passe da sua conta. Use o botão abaixo para escolher uma nova.',
    },
    { kind: 'button', label: 'Redefinir a palavra-passe', url: p.resetUrl },
    {
      kind: 'p',
      text: `A ligação só pode ser usada uma vez e é válida até ${formatDateTime(p.expiresAt)}.`,
    },
    {
      kind: 'p',
      text: 'Se não foi você que fez o pedido, ignore este email: a palavra-passe atual continua a funcionar.',
    },
  ]);
}

export function occurrenceCreatedEmail(p: OccurrenceCreatedPayload): EmailMessage {
  return render(
    p.citizen.email,
    `Ocorrência ${p.reference} recebida`,
    'Recebemos a sua ocorrência',
    [
      { kind: 'p', text: `Obrigado, ${firstName(p.citizen.name)}.` },
      {
        kind: 'p',
        text: 'A sua ocorrência foi registada e vai ser analisada pela equipa municipal.',
      },
      {
        kind: 'facts',
        rows: [
          ['Referência', p.reference],
          ['Categoria', p.category.name],
          ['Localização', p.address],
          ['Data', formatDateTime(p.createdAt)],
        ],
      },
      {
        kind: 'p',
        text: 'Vai receber um email sempre que o estado mudar. Pode acompanhar o progresso em «As minhas ocorrências», na aplicação.',
      },
    ],
  );
}

/** What each status means for the citizen, in plain language (RF05). */
export const STATUS_EXPLANATIONS: Readonly<Record<OccurrenceStatus, string>> = {
  RECEBIDA: 'A ocorrência foi registada e aguarda análise da equipa municipal.',
  EM_ANALISE: 'A equipa municipal confirmou a ocorrência e está a avaliar o que é preciso fazer.',
  EM_RESOLUCAO: 'Os trabalhos para resolver a ocorrência já começaram.',
  RESOLVIDA: 'A ocorrência foi resolvida. Obrigado por ajudar a melhorar o concelho de Barcelos.',
  REJEITADA: 'A Câmara Municipal não vai tratar esta ocorrência. Veja a fundamentação abaixo.',
  DUPLICADA:
    'Esta situação já tinha sido reportada. Vai ser tratada na ocorrência original, por isso esta foi encerrada.',
  ANULADA: 'Anulou esta ocorrência. Não vai ser tratada pela Câmara Municipal.',
};

export function statusChangedEmail(p: OccurrenceStatusChangedPayload): EmailMessage {
  const label = STATUS_LABELS[p.to];
  const blocks: Block[] = [
    { kind: 'p', text: `Olá, ${firstName(p.citizen.name)}.` },
    { kind: 'p', text: STATUS_EXPLANATIONS[p.to] },
    {
      kind: 'facts',
      rows: [
        ['Referência', p.reference],
        ['Estado anterior', STATUS_LABELS[p.from]],
        ['Novo estado', label],
        ['Data', formatDateTime(p.changedAt)],
      ],
    },
  ];
  if (p.reason) blocks.push({ kind: 'quote', label: 'Fundamentação', text: p.reason });
  if (p.originalReference) {
    blocks.push({
      kind: 'p',
      text: `A ocorrência original é a ${p.originalReference}. Pode acompanhá-la no mapa da aplicação.`,
    });
  }
  if (p.note) blocks.push({ kind: 'quote', label: 'Nota da equipa municipal', text: p.note });
  return render(
    p.citizen.email,
    `Ocorrência ${p.reference}: ${label}`,
    `A sua ocorrência está «${label}»`,
    blocks,
  );
}

/** Maps an event to the email it produces. */
export function emailFor(event: AnyEvent): EmailMessage {
  switch (event.type) {
    case EventType.USER_REGISTERED:
      return welcomeEmail(event.payload);
    case EventType.USER_PASSWORD_RESET_REQUESTED:
      return passwordResetEmail(event.payload);
    case EventType.OCCURRENCE_CREATED:
      return occurrenceCreatedEmail(event.payload);
    case EventType.OCCURRENCE_STATUS_CHANGED:
      return statusChangedEmail(event.payload);
  }
}
