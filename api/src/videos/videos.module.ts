import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    // configuração simples; destino final ajustamos no controller (diskStorage)
    MulterModule.register({}),
  ],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
