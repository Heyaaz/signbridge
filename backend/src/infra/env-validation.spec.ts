import { validateEnv } from "./env-validation";

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("DATABASE_URL이 설정되어 있으면 예외 없이 실행된다", () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";

    expect(() => validateEnv()).not.toThrow();
  });

  it("DATABASE_URL이 없으면 에러를 throw한다", () => {
    delete process.env.DATABASE_URL;

    expect(() => validateEnv()).toThrow("DATABASE_URL");
  });

  it("throw된 에러 메시지에 누락된 변수명이 포함된다", () => {
    delete process.env.DATABASE_URL;

    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });
});
