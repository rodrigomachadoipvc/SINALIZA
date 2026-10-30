import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';

import { MunicipalityService, type MunicipalityView } from './municipality.service.js';

export class MunicipalityDto {
  @ApiProperty({ example: 'Barcelos' })
  name: string;

  @ApiProperty({
    description: 'Limite do concelho em GeoJSON (MultiPolygon, WGS84 / EPSG:4326).',
    example: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [-8.6, 41.5],
            [-8.5, 41.5],
            [-8.5, 41.6],
            [-8.6, 41.5],
          ],
        ],
      ],
    },
  })
  boundary: MunicipalityView['boundary'];
}

@ApiTags('municipality')
@ApiBearerAuth()
@Controller('municipality')
export class MunicipalityController {
  constructor(private readonly municipality: MunicipalityService) {}

  @Get()
  @ApiOperation({ summary: 'Nome e limite do concelho (RF11, RF12)' })
  @ApiResponse({ status: 200, type: MunicipalityDto })
  get(): Promise<MunicipalityView> {
    return this.municipality.get();
  }
}
