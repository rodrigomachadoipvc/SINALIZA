import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  type AuthUser,
  badRequest,
  conflict,
  forbidden,
  LocalizedHttpException,
  notFound,
  paginate,
  skipTake,
  unprocessable,
} from '@sinaliza/service-kit';
import {
  allowedTransitions,
  checkDuplicateTarget,
  checkTransition,
  CITIZEN_STATUS_GROUPS,
  type DuplicateTargetErrorCode,
  EventType,
  formatReference,
  isStaff,
  MIN_REASON_LENGTH,
  OPEN_STATUSES,
  OccurrenceStatus,
  type Paginated,
  PUBLIC_STATUSES,
  STATUS_LABELS,
  type TransitionErrorCode,
} from '@sinaliza/shared';

import { parseBBox } from '../common/validation.js';
import { EventsService } from '../events.service.js';
import type { Occurrence, Prisma, StatusHistory } from '../generated/prisma/client.js';
import { BoundaryService } from '../integrations/boundary.service.js';
import { GeocoderService } from '../integrations/geocoder.service.js';
import { type MunicipalCategory, MunicipalClient } from '../integrations/municipal.client.js';
import { StorageService } from '../integrations/storage.service.js';
import { uploadPrefix } from '../photos/photo-processing.js';
import { PrismaService } from '../prisma.service.js';
import type {
  CreatedOccurrenceDto,
  CreateOccurrenceDto,
  MineQueryDto,
  OccurrenceCardDto,
  OccurrenceDetailDto,
  StaffListQueryDto,
  StaffRowDto,
  StaffSort,
} from './occurrences.dto.js';

export const OUTSIDE_MUNICIPALITY =
  'Esta localização está fora do concelho de Barcelos. O Sinaliza só aceita ocorrências dentro do concelho.';

const NOT_FOUND = 'A ocorrência não existe.';
const DAY_MS = 86_400_000;

/** The year of `date` in Portugal (references restart every 1 January, local time). */
function lisbonYear(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en', { timeZone: 'Europe/Lisbon', year: 'numeric' }).format(date),
  );
}

function transitionError(
  code: TransitionErrorCode,
  from: OccurrenceStatus,
  to: OccurrenceStatus,
): LocalizedHttpException {
  switch (code) {
    case 'INVALID_TRANSITION':
      return conflict(
        `Não é possível passar uma ocorrência de «${STATUS_LABELS[from]}» para «${STATUS_LABELS[to]}».`,
      );
    case 'FORBIDDEN':
      return forbidden('Não tem permissão para fazer esta alteração de estado.');
    case 'REASON_REQUIRED':
      return badRequest(
        `Indique a fundamentação da rejeição (pelo menos ${MIN_REASON_LENGTH} caracteres).`,
        [{ field: 'reason', messages: ['A fundamentação é obrigatória para rejeitar.'] }],
      );
    case 'ORIGINAL_REQUIRED':
      return badRequest('Escolha a ocorrência original.');
  }
}

const DUPLICATE_MESSAGES: Record<DuplicateTargetErrorCode, string> = {
  ORIGINAL_NOT_FOUND: 'A ocorrência original não existe.',
  ORIGINAL_IS_SELF: 'Uma ocorrência não pode ser duplicada de si própria.',
  ORIGINAL_INVALID_STATUS: 'A ocorrência original não pode estar duplicada nem anulada.',
};

const SORTS: Record<StaffSort, Prisma.OccurrenceOrderByWithRelationInput[]> = {
  '-createdAt': [{ createdAt: 'desc' }],
  createdAt: [{ createdAt: 'asc' }],
  '-updatedAt': [{ updatedAt: 'desc' }],
  updatedAt: [{ updatedAt: 'asc' }],
  reference: [{ reference: 'asc' }],
  '-reference': [{ reference: 'desc' }],
  status: [{ status: 'asc' }, { createdAt: 'desc' }],
  '-status': [{ status: 'desc' }, { createdAt: 'desc' }],
  category: [{ categoryName: 'asc' }, { createdAt: 'desc' }],
  '-category': [{ categoryName: 'desc' }, { createdAt: 'desc' }],
};

/** Columns read by the API (everything except the PostGIS `location`, read through lat/lng). */
type OccurrenceRow = Occurrence;

export function daysOpen(
  o: Pick<Occurrence, 'status' | 'createdAt' | 'resolvedAt' | 'updatedAt'>,
  now = new Date(),
): number {
  const end = OPEN_STATUSES.includes(o.status) ? now : (o.resolvedAt ?? o.updatedAt);
  return Math.max(0, Math.floor((end.getTime() - o.createdAt.getTime()) / DAY_MS));
}

interface TransitionInput {
  to: OccurrenceStatus;
  note?: string | undefined;
  reason?: string | undefined;
  originalId?: string | undefined;
}

@Injectable()
export class OccurrencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly municipal: MunicipalClient,
    private readonly boundary: BoundaryService,
    private readonly geocoder: GeocoderService,
    private readonly storage: StorageService,
  ) {}

  // ------------------------------------------------------------ citizen

  async create(
    user: AuthUser,
    dto: CreateOccurrenceDto,
    requestId?: string,
  ): Promise<CreatedOccurrenceDto> {
    const category = await this.activeCategory(dto.categoryId, requestId);
    if (!(await this.boundary.contains(dto.lat, dto.lng))) {
      throw unprocessable(OUTSIDE_MUNICIPALITY, [
        { field: 'location', messages: [OUTSIDE_MUNICIPALITY] },
      ]);
    }
    if (dto.photoKey) {
      if (
        !dto.photoKey.startsWith(uploadPrefix(user.id)) ||
        !(await this.storage.exists(dto.photoKey))
      ) {
        throw unprocessable('A fotografia indicada não existe. Envie-a novamente.');
      }
    }
    const address = await this.geocoder.reverse(dto.lat, dto.lng);

    const id = randomUUID();
    const now = new Date();
    const year = lisbonYear(now);
    const reference = await this.prisma.$transaction(async (tx) => {
      const [counter] = await tx.$queryRaw<Array<{ last_value: number }>>`
        INSERT INTO reference_counters (year, last_value) VALUES (${year}, 1)
        ON CONFLICT (year) DO UPDATE SET last_value = reference_counters.last_value + 1
        RETURNING last_value
      `;
      const ref = formatReference(year, counter?.last_value ?? 1);
      await tx.$executeRaw`
        INSERT INTO occurrences (
          id, reference, citizen_id, citizen_name, citizen_email,
          category_id, category_name, category_slug, description, status,
          location, address, photo_key, created_at, updated_at
        ) VALUES (
          ${id}::uuid, ${ref}, ${user.id}::uuid, ${user.name}, ${user.email},
          ${category.id}::uuid, ${category.name}, ${category.slug}, ${dto.description},
          'RECEBIDA'::occurrence_status,
          ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)::geography,
          ${address}, ${dto.photoKey ?? null}, ${now}, ${now}
        )
      `;
      await tx.statusHistory.create({
        data: {
          occurrenceId: id,
          fromStatus: null,
          toStatus: OccurrenceStatus.RECEBIDA,
          changedBy: user.id,
          changedByRole: user.role,
          changedAt: now,
        },
      });
      return ref;
    });

    this.events.emit(EventType.OCCURRENCE_CREATED, {
      id,
      reference,
      citizen: { id: user.id, name: user.name, email: user.email },
      category: { id: category.id, name: category.name, slug: category.slug },
      address,
      createdAt: now.toISOString(),
    });
    return { id, reference, status: OccurrenceStatus.RECEBIDA };
  }

  async listMine(user: AuthUser, query: MineQueryDto): Promise<Paginated<OccurrenceCardDto>> {
    const where: Prisma.OccurrenceWhereInput = {
      citizenId: user.id,
      status: { in: [...CITIZEN_STATUS_GROUPS[query.status]] },
    };
    const [rows, total] = await Promise.all([
      this.prisma.occurrence.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        ...skipTake(query),
      }),
      this.prisma.occurrence.count({ where }),
    ]);
    return paginate(await Promise.all(rows.map((o) => this.toCard(o))), total, query);
  }

  /** Author or staff. Another citizen gets 404, so ids of other people's reports are not revealed. */
  async detail(user: AuthUser, id: string): Promise<OccurrenceDetailDto> {
    const occurrence = await this.findVisible(user, id);
    const [history, original] = await Promise.all([
      this.prisma.statusHistory.findMany({
        where: { occurrenceId: id },
        orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
      }),
      occurrence.originalId
        ? this.prisma.occurrence.findUnique({
            where: { id: occurrence.originalId },
            select: { id: true, reference: true },
          })
        : null,
    ]);
    return this.toDetail(user, occurrence, history, original);
  }

  async cancel(user: AuthUser, id: string): Promise<OccurrenceDetailDto> {
    await this.transition(user, id, { to: OccurrenceStatus.ANULADA });
    return this.detail(user, id);
  }

  // ------------------------------------------------------------ staff

  async listForStaff(query: StaffListQueryDto): Promise<Paginated<StaffRowDto>> {
    const and: Prisma.OccurrenceWhereInput[] = [
      { status: { in: query.status ?? [...PUBLIC_STATUSES] } },
    ];
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({ OR: [{ reference: contains }, { address: contains }, { description: contains }] });
    }
    if (query.category) and.push({ categorySlug: { in: query.category } });
    if (query.from)
      and.push({ createdAt: { gte: new Date(`${query.from.slice(0, 10)}T00:00:00Z`) } });
    if (query.to) {
      const end = new Date(`${query.to.slice(0, 10)}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      and.push({ createdAt: { lt: end } });
    }
    const bbox = query.bbox ? parseBBox(query.bbox) : null;
    if (bbox) {
      and.push({
        lat: { gte: bbox.minLat, lte: bbox.maxLat },
        lng: { gte: bbox.minLng, lte: bbox.maxLng },
      });
    }

    const where: Prisma.OccurrenceWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.occurrence.findMany({ where, orderBy: SORTS[query.sort], ...skipTake(query) }),
      this.prisma.occurrence.count({ where }),
    ]);
    const now = new Date();
    return paginate(
      rows.map((o) => ({
        id: o.id,
        reference: o.reference,
        status: o.status,
        category: { id: o.categoryId, name: o.categoryName, slug: o.categorySlug },
        address: o.address,
        lat: o.lat,
        lng: o.lng,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        daysOpen: daysOpen(o, now),
      })),
      total,
      query,
    );
  }

  async changeCategory(
    user: AuthUser,
    id: string,
    categoryId: string,
    requestId?: string,
  ): Promise<OccurrenceDetailDto> {
    const occurrence = await this.prisma.occurrence.findUnique({ where: { id } });
    if (!occurrence) throw notFound(NOT_FOUND);
    if (occurrence.status === OccurrenceStatus.ANULADA) {
      throw conflict('Não é possível alterar a categoria de uma ocorrência anulada.');
    }
    if (occurrence.categoryId !== categoryId) {
      const category = await this.activeCategory(categoryId, requestId);
      await this.prisma.occurrence.update({
        where: { id },
        data: { categoryId: category.id, categoryName: category.name, categorySlug: category.slug },
      });
    }
    return this.detail(user, id);
  }

  async changeStatus(
    user: AuthUser,
    id: string,
    input: { to: OccurrenceStatus; note?: string | undefined; reason?: string | undefined },
  ): Promise<OccurrenceDetailDto> {
    if (input.reason !== undefined && input.to !== OccurrenceStatus.REJEITADA) {
      throw badRequest('A fundamentação só se aplica à rejeição. Use o campo «note».');
    }
    await this.transition(user, id, input);
    return this.detail(user, id);
  }

  async markDuplicate(
    user: AuthUser,
    id: string,
    originalId: string,
    note?: string,
  ): Promise<OccurrenceDetailDto> {
    await this.transition(user, id, { to: OccurrenceStatus.DUPLICADA, originalId, note });
    return this.detail(user, id);
  }

  // ------------------------------------------------------------ shared

  /**
   * Applies one state-machine transition: validates it, updates the row only if the status is
   * still the one we read (optimistic concurrency → 409 otherwise), writes the history entry in
   * the same transaction and publishes `occurrence.status_changed`.
   */
  private async transition(user: AuthUser, id: string, input: TransitionInput): Promise<void> {
    const occurrence = await this.findVisible(user, id);
    const from = occurrence.status;
    const result = checkTransition({
      from,
      to: input.to,
      role: user.role,
      isAuthor: occurrence.citizenId === user.id,
      reason: input.reason,
      originalId: input.originalId,
    });
    if (!result.ok) throw transitionError(result.code, from, input.to);

    let originalReference: string | undefined;
    if (input.to === OccurrenceStatus.DUPLICADA && input.originalId) {
      const original = await this.prisma.occurrence.findUnique({
        where: { id: input.originalId },
        select: { id: true, status: true, reference: true },
      });
      const check = checkDuplicateTarget(id, original);
      if (!check.ok) {
        throw unprocessable(DUPLICATE_MESSAGES[check.code], [
          { field: 'originalId', messages: [DUPLICATE_MESSAGES[check.code]] },
        ]);
      }
      originalReference = original?.reference;
    }

    const now = new Date();
    const reason = input.reason?.trim();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.occurrence.updateMany({
        where: { id, status: from },
        data: {
          status: input.to,
          ...(input.to === OccurrenceStatus.RESOLVIDA ? { resolvedAt: now } : {}),
          ...(input.to === OccurrenceStatus.ANULADA ? { cancelledAt: now } : {}),
          ...(input.to === OccurrenceStatus.REJEITADA ? { rejectionReason: reason ?? null } : {}),
          ...(input.to === OccurrenceStatus.DUPLICADA
            ? { originalId: input.originalId ?? null }
            : {}),
        },
      });
      if (count === 0) {
        throw conflict(
          'A ocorrência foi alterada entretanto. Atualize a página e tente novamente.',
        );
      }
      await tx.statusHistory.create({
        data: {
          occurrenceId: id,
          fromStatus: from,
          toStatus: input.to,
          note: input.note ?? null,
          reason: reason ?? null,
          changedBy: user.id,
          changedByRole: user.role,
          changedAt: now,
        },
      });
    });

    this.events.emit(EventType.OCCURRENCE_STATUS_CHANGED, {
      id,
      reference: occurrence.reference,
      citizen: {
        id: occurrence.citizenId,
        name: occurrence.citizenName,
        email: occurrence.citizenEmail,
      },
      from,
      to: input.to,
      ...(input.note ? { note: input.note } : {}),
      ...(reason ? { reason } : {}),
      ...(originalReference ? { originalReference } : {}),
      changedAt: now.toISOString(),
    });
  }

  private async findVisible(user: AuthUser, id: string): Promise<OccurrenceRow> {
    const occurrence = await this.prisma.occurrence.findUnique({ where: { id } });
    if (!occurrence || (!isStaff(user.role) && occurrence.citizenId !== user.id)) {
      throw notFound(NOT_FOUND);
    }
    return occurrence;
  }

  private async activeCategory(id: string, requestId?: string): Promise<MunicipalCategory> {
    const category = await this.municipal.getCategory(id, requestId);
    if (!category) {
      throw unprocessable('A categoria escolhida não existe.', [
        { field: 'categoryId', messages: ['A categoria escolhida não existe.'] },
      ]);
    }
    if (!category.active) {
      throw unprocessable('A categoria escolhida já não está disponível. Escolha outra.', [
        { field: 'categoryId', messages: ['A categoria está desativada.'] },
      ]);
    }
    return category;
  }

  private async photoUrl(key: string | null): Promise<string | null> {
    return key ? this.storage.signedUrl(key) : null;
  }

  private async toCard(o: OccurrenceRow): Promise<OccurrenceCardDto> {
    return {
      id: o.id,
      reference: o.reference,
      status: o.status,
      category: { id: o.categoryId, name: o.categoryName, slug: o.categorySlug },
      description: o.description,
      address: o.address,
      photoUrl: await this.photoUrl(o.photoKey),
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }

  private async toDetail(
    user: AuthUser,
    o: OccurrenceRow,
    history: StatusHistory[],
    original: { id: string; reference: string } | null,
  ): Promise<OccurrenceDetailDto> {
    const staff = isStaff(user.role);
    return {
      ...(await this.toCard(o)),
      lat: o.lat,
      lng: o.lng,
      rejectionReason: o.rejectionReason,
      original,
      resolvedAt: o.resolvedAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
      history: history.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        note: h.note,
        reason: h.reason,
        changedByRole: h.changedByRole,
        changedAt: h.changedAt.toISOString(),
      })),
      allowedTransitions: allowedTransitions(o.status, user.role, o.citizenId === user.id),
      ...(staff
        ? { citizen: { id: o.citizenId, name: o.citizenName, email: o.citizenEmail } }
        : {}),
    };
  }
}
