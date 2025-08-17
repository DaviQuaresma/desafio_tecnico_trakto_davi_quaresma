import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VideosModule } from './videos/videos.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), VideosModule],
})
export class AppModule {}
