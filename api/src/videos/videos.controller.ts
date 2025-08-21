import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
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

@Controller('/videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  async list(@Query('page') page = '1', @Query('pageSize') pageSize = '10') {
    return this.videos.list(+page, +pageSize);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.videos.getOne(id);
  }

  // ======= FLUXO OFICIAL: URL PRÉ-ASSINADA =======

  @Post('presign')
  presign(@Body() body: { filename: string; contentType: string }) {
    if (!body?.filename || !body?.contentType) {
      throw new BadRequestException('filename e contentType são obrigatórios');
    }
    return this.videos.presignOriginal(body.filename, body.contentType);
  }

  @Post('complete')
  complete(@Body() body: { id: string; size?: number }) {
    if (!body?.id) throw new BadRequestException('id é obrigatório');
    return this.videos.completeUpload(body.id, body.size);
  }

  // ======= FLUXO DEV: multipart → API (sobe p/ GCS) =======

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
        validators: [new MaxFileSizeValidator({ maxSize: 200 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file?.mimetype?.startsWith('video/')) {
      throw new BadRequestException(
        `Arquivo inválido (${file?.mimetype ?? 'desconhecido'}). Envie um vídeo.`,
      );
    }
    return this.videos.processUpload(file);
  }
}
