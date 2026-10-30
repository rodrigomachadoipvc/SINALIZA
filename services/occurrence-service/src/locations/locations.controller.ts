import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Roles } from '@sinaliza/service-kit';
import { UserRole } from '@sinaliza/shared';

import { CoordinatesDto } from '../common/validation.js';
import { BoundaryService } from '../integrations/boundary.service.js';
import { GeocoderService } from '../integrations/geocoder.service.js';

export class LocationCheckDto {
  @ApiProperty({ description: 'O ponto está dentro do concelho de Barcelos.' })
  inside: boolean;

  @ApiProperty({
    example: 'Rua Dr. Manuel Pais 12, Barcelos',
    description: 'Morada aproximada; se o reverse geocoding falhar, as coordenadas.',
  })
  address: string;
}

@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly boundary: BoundaryService,
    private readonly geocoder: GeocoderService,
  ) {}

  @Post('validate')
  @Roles(UserRole.CIDADAO)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar uma localização (RF12)',
    description: 'Indica se o ponto está dentro do concelho e devolve a morada aproximada.',
  })
  async validate(@Body() body: CoordinatesDto): Promise<LocationCheckDto> {
    const inside = await this.boundary.contains(body.lat, body.lng);
    const address = await this.geocoder.reverse(body.lat, body.lng);
    return { inside, address };
  }
}
