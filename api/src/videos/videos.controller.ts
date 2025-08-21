import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { VideosService } from './videos.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { basename, extname } from 'path';
import { randomUUID } from 'crypto';
import type { Response } from 'express';

@Controller('/videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '10',
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.videos.list(+page, +pageSize);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.videos.getOne(id);
  }

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

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './tmp',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname) || '.mp4';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    const video = await this.videos.processUpload(file);
    return video;
  }

  @Get(':id/download/original')
  async downloadOriginal(@Param('id') id: string, @Res() res: Response) {
    return this.downloadInternal(id, 'original', res);
  }

  @Get(':id/download/low')
  async downloadLow(@Param('id') id: string, @Res() res: Response) {
    return this.downloadInternal(id, 'low', res);
  }

  private async downloadInternal(
    id: string,
    which: 'original' | 'low',
    res: Response,
  ) {
    try {
      const rec = await this.videos.getOne(id);
      if (!rec) {
        console.error('Vídeo não encontrado:', id);
        throw new NotFoundException('Arquivo não disponível');
      }
      const key = which === 'low' ? rec.lowKey : rec.originalKey;
      if (!key) {
        console.error('Key não encontrada:', which, rec);
        throw new NotFoundException('Arquivo não disponível');
      }

      const meta = await this.videos.getObjectMetadata(key);
      const stream = this.videos.openReadStream(key);

      const ct = meta?.contentType || 'application/octet-stream';
      const size = Number(meta?.size || 0);

      const base = (rec.originalFilename || basename(key)).replace(
        /\.[^.]+$/,
        '',
      );
      const ext = extname(key) || '.mp4';
      const name = which === 'low' ? `${base}_low${ext}` : `${base}${ext}`;

      res.setHeader('Content-Type', ct);
      if (size) res.setHeader('Content-Length', String(size));
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.setHeader('Cache-Control', 'no-store');

      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end('stream error');
        else res.end();
      });
      stream.pipe(res);
    } catch (e) {
      console.error('Erro no download:', e);
      if (!res.headersSent) res.status(404).end('Arquivo não encontrado');
      else res.end();
    }
  }
}
