import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// 拍照问一问: 4张 × 2MB 图片经 base64 后约 10.7MB JSON, 放宽到 15MB 留余量
// (实际张数/单张大小由 SendMessageDto 的 images 校验收口)
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '15mb';

async function bootstrap() {
  // 关闭 Nest 内置 body parser(默认 100kb), 换成带大 payload 限额的 json/urlencoded
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

  // 全局前缀: /api/v1
  app.setGlobalPrefix('api/v1');

  // CORS — 允许小程序和开发工具访问
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-Id',
      'X-Digital-Human-Session',
      'X-Digital-Human-Control',
      'Accept',
    ],
  });

  // 全局校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  // 全局响应格式拦截器
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new LoggingInterceptor(),
  );

  // Swagger 文档 (开发环境)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('炎华众康 MVP API')
      .setDescription('炎华众康 · 主动健康管理系统 — MVP 后端 API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`[YHZK-MVP] Server running on http://localhost:${port}`);
  console.log(`[YHZK-MVP] API Docs: http://localhost:${port}/api/docs`);
}

bootstrap();
