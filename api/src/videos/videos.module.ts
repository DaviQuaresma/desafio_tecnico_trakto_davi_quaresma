import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    MulterModule.register({}),
    StorageModule,
  ],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
