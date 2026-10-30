// Demo occurrences (spec section 10): Maria's four from the prototype plus ~40 from other
// citizens spread over the municipality, so the map and the dashboard have content.
// Pure data and helpers; `seed.ts` writes them to the database.
import { createHash } from 'node:crypto';

import { formatReference, OccurrenceStatus, UserRole } from '@sinaliza/shared';

const S = OccurrenceStatus;

export const SEED_YEAR = 2026;
/** Every demo date is before this instant, so the data never describes the future. */
export const SEED_NOW = new Date('2026-10-29T12:00:00Z');

export const MARIA = 'maria.fernandes@email.pt';
export const DEMO_GESTOR = 'gestor@sinaliza.pt';

/** Authors of the other occurrences (created by the identity-service seed). */
export const OTHER_CITIZENS = [
  'joao.martins@example.com',
  'ana.rodrigues@example.com',
  'pedro.costa@example.com',
  'sofia.pereira@example.com',
  'rui.almeida@example.com',
  'carla.sousa@example.com',
  'tiago.goncalves@example.com',
  'ines.carvalho@example.com',
  'miguel.ribeiro@example.com',
  'beatriz.lopes@example.com',
] as const;

export type DemoCategory =
  'vias' | 'iluminacao' | 'residuos' | 'sinalizacao' | 'passeios' | 'outro';

export interface DemoStep {
  to: OccurrenceStatus;
  at: Date;
  /** Who made the change: the author (creation, cancellation) or the demo gestor. */
  by: 'AUTHOR' | 'GESTOR';
  note?: string;
  reason?: string;
}

export interface DemoOccurrence {
  id: string;
  reference: string;
  citizenEmail: string;
  category: DemoCategory;
  description: string;
  address: string;
  lat: number;
  lng: number;
  createdAt: Date;
  /** Status changes after creation, oldest first. The last one is the current status. */
  steps: DemoStep[];
  originalReference?: string;
}

/** Stable id derived from the reference (UUID v5 layout), so re-running the seed is a no-op. */
export function seedId(reference: string): string {
  const hex = createHash('sha1').update(`sinaliza-seed:${reference}`).digest('hex');
  const variant = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export function currentStatus(o: Pick<DemoOccurrence, 'steps'>): OccurrenceStatus {
  return o.steps.at(-1)?.to ?? S.RECEBIDA;
}

export function changedByRole(step: Pick<DemoStep, 'by'>): UserRole {
  return step.by === 'AUTHOR' ? UserRole.CIDADAO : UserRole.GESTOR;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function at(iso: string): Date {
  return new Date(iso);
}

function plus(date: Date, days: number, hours = 0): Date {
  return new Date(date.getTime() + days * DAY_MS + hours * HOUR_MS);
}

// ------------------------------------------------------------------ Maria (prototype)

const MARIA_OCCURRENCES: DemoOccurrence[] = [
  {
    id: seedId('SIN-2026-00482'),
    reference: 'SIN-2026-00482',
    citizenEmail: MARIA,
    category: 'iluminacao',
    description:
      'O candeeiro junto à passadeira está apagado há uma semana. À noite a passadeira fica sem iluminação.',
    address: 'Rua Dr. Manuel Pais, Barcelos',
    lat: 41.5329,
    lng: -8.6168,
    createdAt: at('2026-10-28T08:42:00Z'),
    steps: [],
  },
  {
    id: seedId('SIN-2026-00451'),
    reference: 'SIN-2026-00451',
    citizenEmail: MARIA,
    category: 'vias',
    description:
      'Buraco grande na faixa de rodagem, em frente ao n.º 45. Os carros desviam-se para a outra faixa para não lhe passar por cima.',
    address: 'Rua D. António Barroso, Barcelos',
    lat: 41.5338,
    lng: -8.6188,
    createdAt: at('2026-10-09T17:15:00Z'),
    steps: [
      {
        to: S.EM_ANALISE,
        at: at('2026-10-10T09:30:00Z'),
        by: 'GESTOR',
        note: 'Ocorrência validada. Vamos avaliar o local.',
      },
      {
        to: S.EM_RESOLUCAO,
        at: at('2026-10-14T11:05:00Z'),
        by: 'GESTOR',
        note: 'Reparação do pavimento agendada para as próximas semanas.',
      },
    ],
  },
  {
    id: seedId('SIN-2026-00397'),
    reference: 'SIN-2026-00397',
    citizenEmail: MARIA,
    category: 'residuos',
    description:
      'Contentores do lixo a transbordar há vários dias, com sacos espalhados pelo chão do largo.',
    address: 'Largo da Porta Nova, Barcelos',
    lat: 41.5318,
    lng: -8.6197,
    createdAt: at('2026-08-28T10:20:00Z'),
    steps: [
      {
        to: S.EM_ANALISE,
        at: at('2026-08-28T15:40:00Z'),
        by: 'GESTOR',
        note: 'Ocorrência validada. Vamos avaliar o local.',
      },
      {
        to: S.EM_RESOLUCAO,
        at: at('2026-08-29T08:10:00Z'),
        by: 'GESTOR',
        note: 'Recolha extraordinária pedida aos serviços de limpeza urbana.',
      },
      {
        to: S.RESOLVIDA,
        at: at('2026-08-31T16:25:00Z'),
        by: 'GESTOR',
        note: 'Contentores esvaziados e largo limpo. Reforçámos a recolha às segundas-feiras.',
      },
    ],
  },
  {
    id: seedId('SIN-2026-00310'),
    reference: 'SIN-2026-00310',
    citizenEmail: MARIA,
    category: 'passeios',
    description:
      'Lajes do passeio levantadas pelas raízes das árvores. Quem anda de cadeira de rodas tem de ir pela estrada.',
    address: 'Avenida dos Combatentes da Grande Guerra, Barcelos',
    lat: 41.5371,
    lng: -8.6152,
    createdAt: at('2026-07-02T19:05:00Z'),
    originalReference: 'SIN-2026-00287',
    steps: [
      {
        to: S.DUPLICADA,
        at: at('2026-07-03T10:15:00Z'),
        by: 'GESTOR',
        note: 'Este problema já tinha sido reportado e está a ser acompanhado na ocorrência original.',
      },
    ],
  },
];

// ------------------------------------------------------------------ other citizens

/**
 * Creation dates follow the reference numbers: anchored on Maria's occurrences and interpolated
 * in between, so higher references are always newer.
 */
const DATE_ANCHORS: ReadonlyArray<[number, string]> = [
  [1, '2026-01-03T09:00:00Z'],
  [287, '2026-06-20T09:00:00Z'],
  [310, '2026-07-02T19:05:00Z'],
  [397, '2026-08-28T10:20:00Z'],
  [451, '2026-10-09T17:15:00Z'],
  [482, '2026-10-28T08:42:00Z'],
];

export function dateForSequence(sequence: number): Date {
  for (let i = 1; i < DATE_ANCHORS.length; i++) {
    const [s0, d0] = DATE_ANCHORS[i - 1] as [number, string];
    const [s1, d1] = DATE_ANCHORS[i] as [number, string];
    if (sequence >= s0 && sequence <= s1) {
      const t0 = Date.parse(d0);
      const t = t0 + ((Date.parse(d1) - t0) * (sequence - s0)) / (s1 - s0);
      return new Date(Math.round(t / 60_000) * 60_000);
    }
  }
  throw new RangeError(`Sequence ${sequence} is outside the demo range`);
}

const IN_PROGRESS_NOTES: Record<DemoCategory, string> = {
  vias: 'Reparação do pavimento agendada.',
  iluminacao: 'Pedido de reparação enviado à equipa de iluminação pública.',
  residuos: 'Recolha agendada com os serviços de limpeza urbana.',
  sinalizacao: 'Substituição da sinalização agendada.',
  passeios: 'Reparação do passeio incluída no plano de obras.',
  outro: 'Intervenção agendada.',
};

const RESOLVED_NOTES: Record<DemoCategory, string> = {
  vias: 'Pavimento reparado.',
  iluminacao: 'Candeeiro reparado e a funcionar.',
  residuos: 'Resíduos recolhidos e local limpo.',
  sinalizacao: 'Sinalização reposta.',
  passeios: 'Passeio reparado.',
  outro: 'Situação resolvida.',
};

const VALIDATED_NOTE = 'Ocorrência validada. Vamos avaliar o local.';
const DUPLICATE_NOTE = 'Já existe uma ocorrência para este problema.';

type FinalStatus = Exclude<OccurrenceStatus, typeof S.DUPLICADA>;

interface Row {
  seq: number;
  status: FinalStatus | [typeof S.DUPLICADA, number];
  category: DemoCategory;
  description: string;
  address: string;
  lat: number;
  lng: number;
  reason?: string;
}

// prettier-ignore
const ROWS: Row[] = [
  // Resolved during the year.
  { seq: 12, status: S.RESOLVIDA, category: 'vias', description: 'Buraco na estrada com cerca de meio metro, cheio de água quando chove.', address: 'Rua da Igreja, Vila Frescainha', lat: 41.5258, lng: -8.6335 },
  { seq: 38, status: S.RESOLVIDA, category: 'iluminacao', description: 'Três candeeiros seguidos apagados; a rua fica completamente às escuras.', address: 'Rua Central, Lijó', lat: 41.552, lng: -8.604 },
  { seq: 64, status: S.RESOLVIDA, category: 'residuos', description: 'Monte de entulho de obras deixado na berma da estrada.', address: 'Rua do Souto, Alvelos', lat: 41.509, lng: -8.614 },
  { seq: 95, status: S.RESOLVIDA, category: 'sinalizacao', description: 'Sinal de STOP tombado no cruzamento.', address: 'Rua da Escola, Galegos', lat: 41.559, lng: -8.586 },
  { seq: 130, status: S.RESOLVIDA, category: 'passeios', description: 'Calçada solta em vários pontos do passeio; já houve quedas.', address: 'Avenida da Liberdade, Barcelos', lat: 41.5332, lng: -8.6145 },
  { seq: 168, status: S.RESOLVIDA, category: 'outro', description: 'Árvore com ramos partidos pendurados sobre a estrada.', address: 'Rua do Cruzeiro, Tamel', lat: 41.5545, lng: -8.566 },
  { seq: 205, status: S.RESOLVIDA, category: 'iluminacao', description: 'Candeeiro a piscar durante toda a noite, mesmo em frente às janelas.', address: 'Avenida João Duarte, Arcozelo', lat: 41.5392, lng: -8.6118 },
  { seq: 240, status: S.RESOLVIDA, category: 'residuos', description: 'Ecoponto do vidro cheio há mais de uma semana, com garrafas no chão.', address: 'Largo da Madalena, Barcelinhos', lat: 41.5268, lng: -8.6228 },
  { seq: 270, status: S.RESOLVIDA, category: 'vias', description: 'Tampa de esgoto solta; faz muito barulho quando os carros passam por cima.', address: 'Avenida Dr. Sidónio Pais, Barcelos', lat: 41.5357, lng: -8.6131 },
  { seq: 330, status: S.RESOLVIDA, category: 'sinalizacao', description: 'Passadeira com a pintura quase apagada, junto à escola.', address: 'Avenida de São José, Arcozelo', lat: 41.5385, lng: -8.6085 },
  { seq: 372, status: S.RESOLVIDA, category: 'residuos', description: 'Sofá e colchão abandonados junto aos contentores.', address: 'Rua das Areias, Areias de Vilar', lat: 41.501, lng: -8.65 },
  // Rejected.
  { seq: 150, status: S.REJEITADA, category: 'outro', description: 'Ervas altas num terreno vizinho a tapar a vista para a estrada.', address: 'Rua de Gilmonde, Gilmonde', lat: 41.518, lng: -8.658, reason: 'O terreno é propriedade privada; a limpeza cabe ao proprietário, que foi notificado pela Câmara.' },
  { seq: 300, status: S.REJEITADA, category: 'vias', description: 'Buracos na estrada nacional à saída da freguesia.', address: 'Estrada Nacional 103, Carapeços', lat: 41.58, lng: -8.617, reason: 'Esta estrada é da responsabilidade da Infraestruturas de Portugal. Comunicámos a situação a essa entidade.' },
  { seq: 455, status: S.REJEITADA, category: 'iluminacao', description: 'Candeeiro apagado no caminho de acesso às casas.', address: 'Rua da Feira, Manhente', lat: 41.553, lng: -8.637, reason: 'Na vistoria de 13 de outubro o candeeiro estava a funcionar corretamente.' },
  // Cancelled by the author while RECEBIDA.
  { seq: 190, status: S.ANULADA, category: 'outro', description: 'Banco do jardim partido junto ao coreto.', address: 'Campo da República, Barcelos', lat: 41.5345, lng: -8.616 },
  { seq: 474, status: S.ANULADA, category: 'residuos', description: 'Papeleira arrancada e deitada no chão.', address: 'Rua Infante D. Henrique, Barcelos', lat: 41.5361, lng: -8.6178 },
  // In progress.
  { seq: 287, status: S.EM_RESOLUCAO, category: 'passeios', description: 'Passeio degradado ao longo da avenida, com lajes partidas e desniveladas.', address: 'Avenida dos Combatentes da Grande Guerra, Barcelos', lat: 41.5368, lng: -8.6149 },
  { seq: 360, status: S.EM_RESOLUCAO, category: 'passeios', description: 'Passeio sem rebaixamento na passadeira; quem usa cadeira de rodas não consegue subir.', address: 'Avenida Alcaides de Faria, Arcozelo', lat: 41.5302, lng: -8.6125 },
  { seq: 385, status: S.EM_RESOLUCAO, category: 'vias', description: 'Paralelos soltos ao longo da rua; saltam com a passagem dos carros.', address: 'Rua Rosa Ramalho, Barcelinhos', lat: 41.5255, lng: -8.625 },
  { seq: 410, status: S.EM_RESOLUCAO, category: 'sinalizacao', description: 'Espelho do cruzamento partido; não se vê quem vem da direita.', address: 'Rua de Abade de Neiva, Abade de Neiva', lat: 41.548, lng: -8.63 },
  { seq: 425, status: S.EM_RESOLUCAO, category: 'outro', description: 'Fuga de água na via, junto à boca de incêndio.', address: 'Rua da Estação, Arcozelo', lat: 41.5372, lng: -8.606 },
  { seq: 436, status: S.EM_RESOLUCAO, category: 'iluminacao', description: 'Poste de iluminação inclinado depois do temporal; parece que pode cair.', address: 'Rua de Santa Marta, Rio Covo', lat: 41.515, lng: -8.596 },
  { seq: 446, status: S.EM_RESOLUCAO, category: 'residuos', description: 'Despejo ilegal de lixo num terreno junto ao rio.', address: 'Rua da Ponte, Durrães', lat: 41.628, lng: -8.688 },
  { seq: 440, status: S.EM_ANALISE, category: 'vias', description: 'Pavimento abatido junto à tampa do saneamento; os carros batem com força.', address: 'Rua Cândido da Cunha, Barcelos', lat: 41.5312, lng: -8.6176 },
  { seq: 452, status: S.EM_ANALISE, category: 'passeios', description: 'Raízes de árvore levantaram o passeio em frente ao centro de saúde.', address: 'Avenida Paulo Felisberto, Vila Boa', lat: 41.5405, lng: -8.63 },
  { seq: 458, status: S.EM_ANALISE, category: 'sinalizacao', description: 'Sinal de sentido proibido virado ao contrário depois de um acidente.', address: 'Rua de Pereira, Pereira', lat: 41.492, lng: -8.602 },
  { seq: 462, status: S.EM_ANALISE, category: 'iluminacao', description: 'Luminária partida, com fios à vista na base do poste.', address: 'Rua de Ucha, Ucha', lat: 41.506, lng: -8.566 },
  { seq: 466, status: S.EM_ANALISE, category: 'residuos', description: 'Contentor do lixo partido e sem tampa; os animais espalham o lixo.', address: 'Rua de Remelhe, Remelhe', lat: 41.517, lng: -8.573 },
  { seq: 468, status: S.EM_ANALISE, category: 'outro', description: 'Bebedouro do jardim sem água há várias semanas.', address: 'Rua Filipa Borges, Barcelos', lat: 41.534, lng: -8.62 },
  { seq: 471, status: S.EM_ANALISE, category: 'vias', description: 'Buraco à saída da rotunda, perigoso para quem anda de mota.', address: 'Avenida da Igreja, Martim', lat: 41.534, lng: -8.54 },
  // Duplicates of an open occurrence.
  { seq: 222, status: [S.DUPLICADA, 205], category: 'iluminacao', description: 'O candeeiro em frente ao prédio pisca a noite toda.', address: 'Avenida João Duarte, Arcozelo', lat: 41.5393, lng: -8.6117 },
  { seq: 464, status: [S.DUPLICADA, 446], category: 'residuos', description: 'Sacos de lixo e restos de obras despejados na margem do rio.', address: 'Rua da Ponte, Durrães', lat: 41.6281, lng: -8.6879 },
  // Just received.
  { seq: 470, status: S.RECEBIDA, category: 'sinalizacao', description: 'Semáforo dos peões não muda para verde.', address: 'Rua de Viatodos, Viatodos', lat: 41.456, lng: -8.556 },
  { seq: 473, status: S.RECEBIDA, category: 'passeios', description: 'Grade de proteção do passeio solta junto à ponte.', address: 'Rua do Monte, Silveiros', lat: 41.478, lng: -8.6 },
  { seq: 475, status: S.RECEBIDA, category: 'vias', description: 'Valeta entupida; a água da chuva acumula-se na estrada.', address: 'Rua Principal, Fragoso', lat: 41.6, lng: -8.715 },
  { seq: 476, status: S.RECEBIDA, category: 'residuos', description: 'Lixo acumulado no parque infantil, com garrafas partidas no chão.', address: 'Rua da Capela, Cristelo', lat: 41.506, lng: -8.643 },
  { seq: 477, status: S.RECEBIDA, category: 'iluminacao', description: 'Paragem de autocarro sem iluminação; à noite não se vê quem está à espera.', address: 'Rua da Senhora da Saúde, Macieira de Rates', lat: 41.466, lng: -8.655 },
  { seq: 478, status: S.RECEBIDA, category: 'sinalizacao', description: 'Placa com o nome da rua caída no passeio.', address: 'Rua do Perelhal, Perelhal', lat: 41.521, lng: -8.695 },
  { seq: 479, status: S.RECEBIDA, category: 'outro', description: 'Grafitis na parede da escola primária.', address: 'Rua de Chorente, Chorente', lat: 41.596, lng: -8.647 },
  { seq: 480, status: S.RECEBIDA, category: 'passeios', description: 'Passeio interrompido por um poste no meio; obriga a ir pela estrada.', address: 'Rua da Alheira, Alheira', lat: 41.579, lng: -8.61 },
  { seq: 481, status: S.RECEBIDA, category: 'vias', description: 'Lomba de redução de velocidade partida, com pedaços de asfalto soltos.', address: 'Rua de Adães, Adães', lat: 41.548, lng: -8.573 },
];

/** Status changes for a row, spaced by a few days that vary with the reference number. */
function stepsFor(row: Row, createdAt: Date): DemoStep[] {
  const n = row.seq;
  const validated = plus(createdAt, 1 + (n % 2), 1);
  const inProgress = plus(validated, 2 + (n % 5), 2);
  const resolved = plus(inProgress, 3 + (n % 9), 3);
  const status = Array.isArray(row.status) ? row.status[0] : row.status;
  const staff = (to: OccurrenceStatus, when: Date, extra: Partial<DemoStep> = {}): DemoStep => ({
    to,
    at: when,
    by: 'GESTOR',
    ...extra,
  });

  switch (status) {
    case S.RECEBIDA:
      return [];
    case S.ANULADA:
      return [{ to: S.ANULADA, at: plus(createdAt, 0, 3), by: 'AUTHOR' }];
    case S.EM_ANALISE:
      return [staff(S.EM_ANALISE, validated, { note: VALIDATED_NOTE })];
    case S.EM_RESOLUCAO:
      return [
        staff(S.EM_ANALISE, validated, { note: VALIDATED_NOTE }),
        staff(S.EM_RESOLUCAO, inProgress, { note: IN_PROGRESS_NOTES[row.category] }),
      ];
    case S.RESOLVIDA:
      return [
        staff(S.EM_ANALISE, validated, { note: VALIDATED_NOTE }),
        staff(S.EM_RESOLUCAO, inProgress, { note: IN_PROGRESS_NOTES[row.category] }),
        staff(S.RESOLVIDA, resolved, { note: RESOLVED_NOTES[row.category] }),
      ];
    case S.REJEITADA:
      return [staff(S.REJEITADA, plus(createdAt, 1 + (n % 3), 2), { reason: row.reason ?? '' })];
    case S.DUPLICADA:
      return [staff(S.DUPLICADA, validated, { note: DUPLICATE_NOTE })];
  }
}

const OTHER_OCCURRENCES: DemoOccurrence[] = ROWS.map((row, i) => {
  const reference = formatReference(SEED_YEAR, row.seq);
  const createdAt = dateForSequence(row.seq);
  const occurrence: DemoOccurrence = {
    id: seedId(reference),
    reference,
    citizenEmail: OTHER_CITIZENS[i % OTHER_CITIZENS.length] as string,
    category: row.category,
    description: row.description,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    createdAt,
    steps: stepsFor(row, createdAt),
  };
  if (Array.isArray(row.status)) {
    occurrence.originalReference = formatReference(SEED_YEAR, row.status[1]);
  }
  return occurrence;
});

/** All demo occurrences, oldest reference first (originals are always inserted before duplicates). */
export const DEMO_OCCURRENCES: readonly DemoOccurrence[] = [
  ...MARIA_OCCURRENCES,
  ...OTHER_OCCURRENCES,
].sort((a, b) => a.reference.localeCompare(b.reference));

/** The reference counter must continue after the highest demo reference. */
export const LAST_DEMO_SEQUENCE = Math.max(
  ...DEMO_OCCURRENCES.map((o) => Number(o.reference.slice(-5))),
);
