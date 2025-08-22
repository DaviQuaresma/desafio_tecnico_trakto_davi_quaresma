import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { StorageModule } from '../storage/storage.module';
import { BullModule } from '@nestjs/bull';
import { VideosProcessor } from './videos.processor';

@Module({
  imports: [
    MulterModule.register({}),
    StorageModule,
    BullModule.forRoot({
      redis: { host: 'redis', port: 6379 },
    }),
    BullModule.registerQueue({ name: 'videos' }),
  ],
  controllers: [VideosController],
  providers: [VideosService, VideosProcessor],
})
export class VideosModule {}
