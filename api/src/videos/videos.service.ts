import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { randomUUID } from 'crypto';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

type Status = 'pending' | 'done' | 'error';

export interface VideoRecord {
  id: string;
  originalKey: string;
  lowKey: string | null;
  originalUrl: string;
  lowUrl: string | null;
  createdAt: string;
  status: Status;
  error?: string;
  originalFilename: string;
  mime: string;
  size: number;
}

@Injectable()
export class VideosService {
  private records: VideoRecord[] = [];

  private readonly storageRoot = join(process.cwd(), 'storage');
  private readonly originalDir = join(this.storageRoot, 'original');
  private readonly lowDir = join(this.storageRoot, 'low');

  constructor() {
    [this.storageRoot, this.originalDir, this.lowDir].forEach((dir) => {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    });
  }

  list(page = 1, pageSize = 10) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const items = this.records.slice().reverse().slice(start, end);
    return {
      page,
      pageSize,
      total: this.records.length,
      items,
    };
  }

  getOne(id: string) {
    const rec = this.records.find((r) => r.id === id);
    if (!rec) throw new NotFoundException('Video not found');
    return rec;
  }

  async processUpload(file: Express.Multer.File) {
    // 1) "Salvar" o original no storage (mock: copiar do tmp/uploads para storage/original)
    const id = file.filename.replace(extname(file.filename), '');
    const ext = extname(file.originalname).toLowerCase() || extname(file.filename);
    const originalKey = `original/${file.filename}`;
    const lowKey = `low/${id}_low${ext}`;

    const srcPath = file.path; // tmp/uploads/<uuid>.<ext>
    const dstOriginal = join(this.storageRoot, originalKey);
    const dstLow = join(this.storageRoot, lowKey);

    copyFileSync(srcPath, dstOriginal);

    // 2) Gerar versão low com ffmpeg (1280px máx na largura, preservando proporção)
    let status: Status = 'pending';
    const rec: VideoRecord = {
      id,
      originalKey,
      lowKey: null,
      originalUrl: `/files/${originalKey}`,
      lowUrl: null,
      createdAt: new Date().toISOString(),
      status,
      originalFilename: file.originalname,
      mime: file.mimetype,
      size: file.size,
    };
    this.records.push(rec);

    try {
      await this.transcodeLow(dstOriginal, dstLow);
      rec.lowKey = lowKey;
      rec.lowUrl = `/files/${lowKey}`;
      rec.status = 'done';
    } catch (e: any) {
      rec.status = 'error';
      rec.error = e?.message ?? String(e);
    }

    return rec;
  }

  private transcodeLow(input: string, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(input)
        // 1280px de largura máx; altura automática (-2 mantém múltiplo de 2)
        .outputOptions([
          '-vf', 'scale=1280:-2',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '28',
          '-c:a', 'aac',
          '-b:a', '96k',
          '-movflags', '+faststart'
        ])
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(output);
    });
  }
}
