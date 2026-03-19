/**
 * 앱 시작 시 필수 환경 변수가 설정되어 있는지 검증한다.
 * 누락 시 Error를 throw하여 NestJS 부트스트랩을 중단시킨다.
 * (process.exit 대신 throw를 사용하여 테스트 환경에서도 안전하게 동작)
 */
export function validateEnv(): void {
  const required = ["DATABASE_URL"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `[Startup] Missing required environment variables: ${missing.join(", ")}`
    );
  }
}
