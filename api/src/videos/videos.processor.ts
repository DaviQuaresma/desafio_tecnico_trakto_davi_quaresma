import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { VideosService } from './videos.service';

@Processor('videos')
export class VideosProcessor {
  constructor(private readonly videosService: VideosService) {}

  @Process('transcode')
  async handleTranscode(job: Job) {
    await this.videosService.handleTranscodeJob(job.data);
  }
}