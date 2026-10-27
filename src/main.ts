import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.enableCors({
    origin: [
      'http://192.168.29.92:3000',
      'http://10.213.10.218:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://indian-public-school-app.vercel.app',
      'https://indian-public-school-app-alpha.vercel.app',
      'https://ips-web.ezsoftapp.in',
      'https://api-ips.ezsoftapp.in',
      'http://ips-web.ezsoftapp.in',
      'http://api-ips.ezsoftapp.in'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  app.setGlobalPrefix('api', {
    exclude: [
      { path: '', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
      { path: 'api/v1/health', method: RequestMethod.GET },
      { path: 'api/health', method: RequestMethod.GET },
    ],
  });

  // Swagger Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('Indian Public School API')
    .setDescription('RESTful API documentation for Indian Public School management system')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'IPS API Documentation',
  });

  // Browsers request this automatically; keep it out of the API 404 handler.
  app.use('/favicon.ico', (_req, res) => res.status(204).end());
  app.useStaticAssets(join(process.cwd(), 'public'));

  const port = process.env.PORT || 5000;
  await app.listen(port, '0.0.0.0');
  console.log(`Indian Public School API is running on: http://localhost:${port}/api`);
  console.log(`Swagger Documentation is available at: http://localhost:${port}/docs`);
}
bootstrap();
