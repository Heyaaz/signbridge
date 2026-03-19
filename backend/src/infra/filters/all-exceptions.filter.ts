import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import { Request, Response } from "express";

/**
 * 전역 예외 필터
 * - HTTP 컨텍스트: 일관된 JSON 응답 { statusCode, message, path, timestamp }
 * - WebSocket 컨텍스트: 로깅만 하고 종료 (Socket 객체에는 HTTP 응답 불가)
 * - Prisma P2025 (레코드 없음): 404 매핑
 * - 그 외 예외: 500, 에러 스택 로깅
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // WebSocket 컨텍스트에서는 HTTP 응답을 보낼 수 없으므로 로깅만 하고 종료
    if (host.getType() !== "http") {
      if (exception instanceof Error) {
        this.logger.error(
          `[${host.getType()}] Unhandled exception: ${exception.message}`,
          exception.stack
        );
      }
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = "Internal server error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === "string") {
        message = body;
      } else if (typeof body === "object" && body !== null) {
        const bodyObj = body as Record<string, unknown>;
        const rawMessage = bodyObj.message;
        // ValidationPipe는 message를 배열로 반환하므로 문자열로 통합
        if (Array.isArray(rawMessage)) {
          message = rawMessage.join(", ");
        } else {
          message = (rawMessage as string) ?? message;
        }
      }
    } else if (exception instanceof Error) {
      const prismaCode = (exception as unknown as Record<string, unknown>).code;

      if (prismaCode === "P2025") {
        // Prisma: 조회 대상 레코드 없음
        status = HttpStatus.NOT_FOUND;
        message = "Resource not found";
      } else {
        // 예상치 못한 서버 오류 — 스택 트레이스 로깅
        this.logger.error(
          `Unhandled exception: ${exception.message}`,
          exception.stack
        );
      }
    } else {
      this.logger.error("Unknown exception", String(exception));
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url ?? "unknown",
      timestamp: new Date().toISOString()
    });
  }
}
