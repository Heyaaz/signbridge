import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { AllExceptionsFilter } from "./all-exceptions.filter";

/**
 * AllExceptionsFilter 단위 테스트
 *
 * HTTP/WebSocket 컨텍스트 분기, 예외 유형별 statusCode/message 매핑,
 * ValidationPipe 배열 메시지 처리를 검증한다.
 */

function makeHttpHost(overrides: Partial<{ url: string }> = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const request = { url: overrides.url ?? "/test" };
  const response = { status };

  const host = {
    getType: jest.fn().mockReturnValue("http"),
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue(response),
      getRequest: jest.fn().mockReturnValue(request)
    })
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

function makeWsHost() {
  const host = {
    getType: jest.fn().mockReturnValue("ws"),
    switchToHttp: jest.fn()
  } as unknown as ArgumentsHost;
  return host;
}

describe("AllExceptionsFilter", () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  describe("HTTP 컨텍스트", () => {
    it("HttpException은 해당 status와 message를 반환한다", () => {
      const { host, status, json } = makeHttpHost();
      filter.catch(new HttpException("Bad request", HttpStatus.BAD_REQUEST), host);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: "Bad request" })
      );
    });

    it("ValidationPipe 배열 message를 쉼표로 이어 문자열로 반환한다", () => {
      const { host, json } = makeHttpHost();
      const exception = new HttpException(
        { message: ["nickname must be a string", "role must be a valid enum value"], error: "Bad Request" },
        HttpStatus.BAD_REQUEST
      );
      filter.catch(exception, host);

      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: "nickname must be a string, role must be a valid enum value"
        })
      );
    });

    it("Prisma P2025 에러는 404로 매핑한다", () => {
      const { host, status, json } = makeHttpHost();
      const prismaError = Object.assign(new Error("Record not found"), { code: "P2025" });
      filter.catch(prismaError, host);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: "Resource not found" })
      );
    });

    it("알 수 없는 에러는 500을 반환한다", () => {
      const { host, status } = makeHttpHost();
      filter.catch(new Error("Unexpected DB error"), host);

      expect(status).toHaveBeenCalledWith(500);
    });

    it("응답에 path와 timestamp 필드가 포함된다", () => {
      const { host, json } = makeHttpHost({ url: "/rooms" });
      filter.catch(new HttpException("Not Found", 404), host);

      const call = json.mock.calls[0][0] as Record<string, unknown>;
      expect(call.path).toBe("/rooms");
      expect(call.timestamp).toBeDefined();
    });
  });

  describe("WebSocket 컨텍스트", () => {
    it("WebSocket 컨텍스트에서는 switchToHttp를 호출하지 않는다", () => {
      const host = makeWsHost();
      // switchToHttp를 호출하면 에러가 발생하도록 설정
      (host.switchToHttp as jest.Mock).mockImplementation(() => {
        throw new Error("should not call switchToHttp in WS context");
      });

      // 에러 없이 실행되어야 한다
      expect(() => {
        filter.catch(new Error("WS error"), host);
      }).not.toThrow();
    });
  });
});
