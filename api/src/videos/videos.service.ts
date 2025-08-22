import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { GcsService } from '../storage/gcs.service';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

type Status = 'pending' | 'done' | 'error';

export interface VideoRecord {
  id: string;
  originalKey: string;
  lowKey: string | null;
  originalUrl: string | null;
  lowUrl: string | null;
  createdAt: string;
  status: Status;
  error?: string;
  originalFilename: string;
  mime: string;
  size: number | null;
}

function slugify(filename: string) {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

@Injectable()
export class VideosService {
  private records: VideoRecord[] = [];
  private readonly signedTtlSec: number;

  constructor(
    private readonly gcs: GcsService,
    cfg: ConfigService,
    @InjectQueue('videos') private readonly videoQueue: Queue,
  ) {
    this.signedTtlSec = Number(cfg.get('GCS_SIGNED_URL_EXPIRES') ?? 3600);
  }

  async list(page = 1, pageSize = 10) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    const slice = this.records.slice().reverse().slice(start, end);

    await Promise.all(slice.map((r) => this.refreshSignedUrls(r)));

    return { page, pageSize, total: this.records.length, items: slice };
  }

  async refreshSignedUrls(rec: VideoRecord) {
    rec.originalUrl = rec.originalKey
      ? await this.gcs.getReadSignedUrl(rec.originalKey, this.signedTtlSec)
      : null;
    rec.lowUrl = rec.lowKey
      ? await this.gcs.getReadSignedUrl(rec.lowKey, this.signedTtlSec)
      : null;
  }

  async getOne(id: string) {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) {
      console.error('Video não encontrado no array em memória:', id);
      throw new NotFoundException('Video not found');
    }
    await this.refreshSignedUrls(rec);
    return rec;
  }

  async processUpload(file: Express.Multer.File) {
    const ext = extname(file.originalname).toLowerCase() || '.mp4';
    const base = slugify(file.originalname.replace(ext, ''));
    const sufixo = Math.random().toString(36).slice(2, 8);
    const id = `${base}-${sufixo}`;
    const originalKey = `original/${id}${ext}`;
    const lowKey = `low/${id}_low${ext}`;

    await this.gcs.uploadLocalFile(file.path, originalKey, file.mimetype);
    if (existsSync(file.path)) unlinkSync(file.path);

    const rec: VideoRecord = {
      id,
      originalKey,
      lowKey: null,
      originalUrl: null,
      lowUrl: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      originalFilename: file.originalname,
      mime: file.mimetype,
      size: file.size,
    };
    this.records.push(rec);

    await this.videoQueue.add('transcode', {
      id,
      originalKey,
      lowKey,
      ext,
    });

    await this.refreshSignedUrls(rec);
    return rec;
  }

  async handleTranscodeJob(data: {
    id: string;
    originalKey: string;
    lowKey: string;
    ext: string;
  }) {
    const rec = this.records.find((r) => r.id === data.id);
    if (!rec) return;
    try {
      await this.transcodeFromGcs(data.originalKey, data.lowKey, data.ext);
      rec.lowKey = data.lowKey;
      rec.status = 'done';
      await this.refreshSignedUrls(rec);
    } catch (e: any) {
      rec.status = 'error';
      rec.error = e?.message ?? String(e);
      await this.refreshSignedUrls(rec);
    }
  }

  getObjectMetadata(objectKey: string) {
    return this.gcs.getMetadata(objectKey);
  }

  openReadStream(objectKey: string) {
    return this.gcs.getReadStream(objectKey);
  }

  async presignOriginal(filename: string, contentType: string) {
    if (!contentType?.startsWith('video/')) {
      throw new BadRequestException('contentType inválido');
    }
    const id = randomUUID();
    const ext = extname(filename) || '.mp4';
    const originalKey = `original/${id}${ext}`;

    const uploadUrl = await this.gcs.getWriteSignedUrl(
      originalKey,
      contentType,
    );

    const rec: VideoRecord = {
      id,
      originalKey,
      lowKey: null,
      originalUrl: null,
      lowUrl: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      originalFilename: filename,
      mime: contentType,
      size: null,
    };
    this.records.push(rec);

    return { id, uploadUrl, originalKey };
  }

  async completeUpload(id: string, size?: number) {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) throw new NotFoundException('id inválido');

    const exists = await this.gcs.exists(rec.originalKey);
    if (!exists)
      throw new BadRequestException('Objeto original não encontrado');

    const meta = await this.gcs.getMetadata(rec.originalKey);
    rec.size = size ?? Number(meta.size ?? 0);
    rec.mime = meta.contentType ?? rec.mime;

    const ext = extname(rec.originalKey) || '.mp4';
    const lowKey = `low/${rec.id}_low${ext}`;

    try {
      await this.transcodeFromGcs(rec.originalKey, lowKey, ext);
      rec.lowKey = lowKey;
      rec.status = 'done';
    } catch (e: any) {
      rec.status = 'error';
      rec.error = e?.message ?? String(e);
    }
    await this.refreshSignedUrls(rec);
    return rec;
  }

  private async transcodeFromGcs(
    originalKey: string,
    lowKey: string,
    ext: string,
  ) {
    const localSrc = await this.gcs.downloadToTmp(originalKey, ext);
    const localDst = localSrc.replace(ext, `_low${ext}`);

    const { statSync, readFileSync, existsSync, unlinkSync } = await import(
      'fs'
    );
    const st = statSync(localSrc);
    if (!st.size) throw new Error('Arquivo baixado do GCS está vazio (size=0)');

    const header = readFileSync(localSrc).slice(0, 4096);
    if (!header.toString('utf8').includes('ftyp')) {
      throw new Error('Cabeçalho inválido: não parece MP4');
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg.ffprobe(localSrc, (err, info) => {
        if (err) return reject(new Error(`ffprobe falhou: ${err.message}`));
        const hasVideo = info.streams?.some(
          (s: any) => s.codec_type === 'video',
        );
        if (!hasVideo)
          return reject(new Error('Arquivo sem stream de vídeo válido'));
        resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(localSrc)
        .outputOptions([
          '-vf',
          'scale=w=min(1280\\,iw):h=-2:flags=lanczos',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-preset',
          'veryfast',
          '-crf',
          '28',
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-movflags',
          '+faststart',
        ])
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`ffmpeg: ${err.message}`)))
        .save(localDst);
    });

    await this.gcs.uploadLocalFile(localDst, lowKey, 'video/mp4');
    try {
      if (existsSync(localSrc)) unlinkSync(localSrc);
    } catch {}
    try {
      if (existsSync(localDst)) unlinkSync(localDst);
    } catch {}
  }
}
