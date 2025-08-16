// src/videos/videos.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
} from '@nestjs/common';
import { VideosService } from './videos.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';

// se o seu main.ts NÃO usa app.setGlobalPrefix('api'),
// mude o decorator abaixo para @Controller('api/videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '10') {
    return this.videos.list(+page, +pageSize);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.videos.getOne(id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dest = 'tmp/uploads';
          mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (_req, file, cb) => {
          const id = randomUUID();
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${id}${ext}`);
        },
      }),
    }),
  )
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 200 * 1024 * 1024 }), // 200MB
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    // validação MIME manual (contorna problema do FileTypeValidator)
    if (!file?.mimetype?.startsWith('video/')) {
      throw new BadRequestException(
        `Arquivo inválido (${file?.mimetype ?? 'desconhecido'}). Envie um vídeo.`,
      );
    }

    return this.videos.processUpload(file);
  }
}
