import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { badRequest, Roles } from '@sinaliza/service-kit';
import { UserRole } from '@sinaliza/shared';

import { DashboardDto, DashboardQueryDto, type Period } from './stats.dto.js';
import { STATS_PROVIDER, type StatsProvider } from './stats.provider.js';

const MAX_PERIOD_DAYS = 366 * 5;

function lisbonToday(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(now);
}

/** Default period: the current month and the 11 before it. */
export function resolvePeriod(query: DashboardQueryDto, now = new Date()): Period {
  const to = query.to?.slice(0, 10) ?? lisbonToday(now);
  let from = query.from?.slice(0, 10);
  if (!from) {
    const d = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 11);
    from = d.toISOString().slice(0, 10);
  }
  if (from > to) throw badRequest('A data «de» tem de ser anterior ou igual à data «até».');
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days > MAX_PERIOD_DAYS) throw badRequest('O período não pode ser superior a 5 anos.');
  return { from, to };
}

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(@Inject(STATS_PROVIDER) private readonly stats: StatsProvider) {}

  @Get('dashboard')
  @Roles(UserRole.GESTOR)
  @ApiOperation({
    summary: 'Indicadores do dashboard (RF17)',
    description: '`source` indica a origem: `postgres` (base operacional) ou `databricks`.',
  })
  @ApiResponse({ status: 200, type: DashboardDto })
  dashboard(@Query() query: DashboardQueryDto): Promise<DashboardDto> {
    return this.stats.dashboard(resolvePeriod(query));
  }
}
