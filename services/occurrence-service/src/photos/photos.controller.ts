import { randomUUID } from 'node:crypto';
// Declares Express.Multer.File (the tsconfig limits ambient types to Node).
import type {} from 'multer';

import { Controller, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthUser,
  badRequest,
  CurrentUser,
  LocalizedHttpException,
  Roles,
  unprocessable,
} from '@sinaliza/service-kit';
import { PHOTO_MAX_UPLOAD_BYTES, UserRole } from '@sinaliza/shared';

import { StorageService } from '../integrations/storage.service.js';
import {
  ImageTooLargeError,
  processPhoto,
  UnsupportedImageError,
  uploadPrefix,
} from './photo-processing.js';

export class PhotoUploadDto {
  @ApiProperty({ example: 'uploads/2f0c…/8a1e….jpg', description: 'Usar em `POST /occurrences`.' })
  photoKey: string;

  @ApiProperty({ description: 'URL pré-assinado (GET, 15 min) para pré-visualizar a fotografia.' })
  previewUrl: string;
}

@ApiTags('photos')
@ApiBearerAuth()
@Controller('photos')
export class PhotosController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @Roles(UserRole.CIDADAO)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: PHOTO_MAX_UPLOAD_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Enviar a fotografia de uma ocorrência',
    description:
      'JPEG, PNG ou WebP até 5 MB. É reduzida para no máximo 1600 px e 2 MB e guardada sem metadados.',
  })
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PhotoUploadDto> {
    if (!file) throw badRequest('Escolha uma fotografia para enviar (campo «file»).');

    let photo: Buffer;
    try {
      photo = await processPhoto(file.buffer);
    } catch (error) {
      if (error instanceof UnsupportedImageError) {
        throw new LocalizedHttpException(
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          'A fotografia tem de ser uma imagem JPEG, PNG ou WebP.',
        );
      }
      if (error instanceof ImageTooLargeError) {
        throw unprocessable('Não foi possível reduzir a fotografia para 2 MB. Escolha outra.');
      }
      throw error;
    }

    const photoKey = `${uploadPrefix(user.id)}${randomUUID()}.jpg`;
    await this.storage.put(photoKey, photo, 'image/jpeg');
    return { photoKey, previewUrl: await this.storage.signedUrl(photoKey) };
  }
}
