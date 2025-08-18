import { Test, TestingModule } from '@nestjs/testing';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockVideosService = {
  list: jest.fn().mockResolvedValue([]),
  getOne: jest.fn().mockResolvedValue({ id: '1', lowKey: 'low.mp4', originalKey: 'original.mp4', originalFilename: 'video.mp4' }),
  presignOriginal: jest.fn().mockReturnValue({ url: 'http://fake-url', fields: {} }),
  completeUpload: jest.fn().mockReturnValue({ success: true }),
  processUpload: jest.fn().mockReturnValue({ id: '1', filename: 'video.mp4' }),
  getObjectMetadata: jest.fn().mockResolvedValue({ contentType: 'video/mp4', size: 123 }),
  openReadStream: jest.fn().mockReturnValue({
    on: jest.fn(),
    pipe: jest.fn(),
  }),
};

describe('VideosController', () => {
  let controller: VideosController;
  let service: typeof mockVideosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosController],
      providers: [
        { provide: VideosService, useValue: mockVideosService },
      ],
    }).compile();

    controller = module.get<VideosController>(VideosController);
    service = module.get(VideosService);
  });

  it('deve listar vídeos', async () => {
    await expect(controller.list('1', '10', { setHeader: jest.fn() } as any)).resolves.toEqual([]);
    expect(service.list).toHaveBeenCalledWith(1, 10);
  });

  it('deve retornar um vídeo pelo id', async () => {
    await expect(controller.getOne('1')).resolves.toHaveProperty('id', '1');
    expect(service.getOne).toHaveBeenCalledWith('1');
  });

  it('deve gerar presign', () => {
    expect(controller.presign({ filename: 'video.mp4', contentType: 'video/mp4' })).toHaveProperty('url');
  });

  it('deve lançar erro se presign sem dados', () => {
    expect(() => controller.presign({ filename: '', contentType: '' })).toThrow(BadRequestException);
  });

  it('deve completar upload', () => {
    expect(controller.complete({ id: '1', size: 123 })).toHaveProperty('success', true);
  });

  it('deve lançar erro se completar upload sem id', () => {
    expect(() => controller.complete({ id: '' })).toThrow(BadRequestException);
  });

  it('deve lançar erro se upload não for vídeo', async () => {
    await expect(controller.upload({ mimetype: 'image/png' } as any)).rejects.toThrow(BadRequestException);
  });

  it('deve processar upload de vídeo', async () => {
    await expect(controller.upload({ mimetype: 'video/mp4' } as any)).resolves.toHaveProperty('id', '1');
  });

  it('deve lançar erro se arquivo não disponível no download', async () => {
    service.getOne = jest.fn().mockResolvedValue({ id: '1' });
    await expect(controller['downloadInternal']('1', 'original', { setHeader: jest.fn(), headersSent: false, status: jest.fn().mockReturnThis(), end: jest.fn() } as any)).rejects.toThrow(NotFoundException);
  });
});
