# SignBridge

> 청각 장애인을 위한 영상 기반 의사소통 보조 플랫폼

---

## 개요

SignBridge는 청각 장애인과 비장애인이 영상 통화를 통해 원활하게 의사소통할 수 있도록 지원하는 웹 기반 커뮤니케이션 플랫폼이다.

완전한 실시간 수화 통역이 아니라, **대화 성공률을 높이는 보조 도구**를 목표로 한다.

---

## 핵심 기능

| 기능 | 설명 |
|------|------|
| 영상 통화 | WebRTC 기반 1:1 영상 통화 |
| 실시간 자막 | 음성 → STT → 자막 표시 |
| 텍스트 응답 | 텍스트 입력 → TTS → 음성 전달 |
| 빠른 응답 | 자주 쓰는 문장 버튼 제공 |
| 수화 인식 | 제한된 수화 단어 인식 (확장 기능) |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript, Prisma |
| Database | PostgreSQL |
| Realtime | WebRTC, WebSocket |
| AI | STT API, TTS API |
| Gesture | MediaPipe, Python FastAPI (확장) |

---

## 문서

| 문서 | 설명 |
|------|------|
| [PRD](./PRD.md) | 제품 요구사항 정의서 |
| [TECH_SPEC](./TECH_SPEC.md) | 기술 설계 문서 |
| [WORKFLOW](./WORKFLOW.md) | 현재 구현 기준 사용자 / 서버 / 실시간 흐름 |
| [IMPLEMENTATION_STATUS](./IMPLEMENTATION_STATUS.md) | 현재 코드 기준 구현 범위와 데이터 제외 남은 작업 정리 |

---

## 프로젝트 목적

- 개인 프로젝트
- 공모전 출품
- 포트폴리오

---

## 개발 우선순위

1. Phase 1 — 영상 통화 + WebSocket 연결
2. Phase 2 — STT 자막
3. Phase 3 — TTS + 빠른 응답
4. Phase 4 — 접근성 UI + 수화 확장
