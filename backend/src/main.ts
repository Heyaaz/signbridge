import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./infra/filters/all-exceptions.filter";
import { validateEnv } from "./infra/env-validation";

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? "4000");

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? "*"
  });

  // DTO 유효성 검사: 허용되지 않은 필드 제거(whitelist), 잘못된 타입 즉시 거부
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  // 전역 예외 필터: 일관된 에러 응답 형식 보장
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(port);
}

void bootstrap();
