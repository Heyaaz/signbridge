/** Prisma 에러 코드 상수 — 매직 스트링 방지 */
export const PRISMA_ERROR = {
  UNIQUE_CONSTRAINT: "P2002",
  NOT_FOUND: "P2025"
} as const;
