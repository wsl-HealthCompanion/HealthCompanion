import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { parseTrustedProxyHops } from './common/trusted-proxy';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.getHttpAdapter().getInstance().set(
    'trust proxy',
    parseTrustedProxyHops(process.env.TRUST_PROXY_HOPS),
  );

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
  const host = process.env.HOST;
  if (host) await app.listen(port, host);
  else await app.listen(port);
  console.log(`[YHZK-MVP] Server running on http://${host || 'localhost'}:${port}`);
  console.log(`[YHZK-MVP] API Docs: http://localhost:${port}/api/docs`);
}

bootstrap();
