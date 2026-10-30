import { Controller, Get, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Internal } from '@sinaliza/service-kit';

import { categoryIdPipe } from './categories/categories.controller.js';
import { type CategoryDto, toCategoryDto } from './categories/categories.dto.js';
import { CategoriesService } from './categories/categories.service.js';
import { MunicipalityService, type MunicipalityView } from './municipality/municipality.service.js';

/**
 * Service-to-service API for the occurrence-service (validate a category, fetch the boundary).
 * Never routed by the gateway and hidden from the public OpenAPI document.
 */
@ApiExcludeController()
@Internal()
@Controller('internal')
export class InternalController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly municipality: MunicipalityService,
  ) {}

  @Get('categories/:id')
  async category(@Param('id', categoryIdPipe) id: string): Promise<CategoryDto> {
    return toCategoryDto(await this.categories.get(id));
  }

  @Get('municipality')
  boundary(): Promise<MunicipalityView> {
    return this.municipality.get();
  }
}
