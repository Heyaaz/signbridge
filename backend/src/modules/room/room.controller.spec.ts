import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { RoomController } from "./room.controller";
import { RoomService } from "./room.service";
import { AllExceptionsFilter } from "../../infra/filters/all-exceptions.filter";

/**
 * RoomController 통합 테스트
 *
 * 실제 DB 없이 RoomService를 mock으로 교체한다.
 * ValidationPipe + AllExceptionsFilter를 실제로 등록하여
 * HTTP 요청 → 파이프 → 컨트롤러 → 필터 전체 흐름을 검증한다.
 */

const mockRoomService = {
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
  getRoom: jest.fn(),
  getRoomByInviteCode: jest.fn()
};

describe("RoomController (통합)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomController],
      providers: [{ provide: RoomService, useValue: mockRoomService }]
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─────────────────────────────────────────────
  // POST /rooms
  // ─────────────────────────────────────────────

  describe("POST /rooms", () => {
    it("유효한 body로 방을 생성한다", async () => {
      mockRoomService.createRoom.mockResolvedValue({
        roomId: "room-1",
        inviteCode: "ABC123",
        sessionToken: "session_token",
        sessionId: "session-1"
      });

      const res = await request(app.getHttpServer())
        .post("/rooms")
        .send({ nickname: "홍길동", role: "speaker" })
        .expect(201);

      expect(res.body).toMatchObject({
        roomId: "room-1",
        inviteCode: "ABC123"
      });
      expect(mockRoomService.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({ nickname: "홍길동", role: "speaker" })
      );
    });

    it("nickname이 1자이면 400을 반환한다", async () => {
      const res = await request(app.getHttpServer())
        .post("/rooms")
        .send({ nickname: "홍", role: "speaker" })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
      expect(mockRoomService.createRoom).not.toHaveBeenCalled();
    });

    it("nickname이 공백만 있으면 400을 반환한다 (@Transform trim 후 MinLength 검증)", async () => {
      const res = await request(app.getHttpServer())
        .post("/rooms")
        .send({ nickname: "  ", role: "speaker" })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it("role이 유효하지 않으면 400을 반환한다", async () => {
      const res = await request(app.getHttpServer())
        .post("/rooms")
        .send({ nickname: "홍길동", role: "admin" })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it("허용되지 않은 추가 필드를 포함하면 400을 반환한다 (forbidNonWhitelisted)", async () => {
      const res = await request(app.getHttpServer())
        .post("/rooms")
        .send({ nickname: "홍길동", role: "speaker", adminKey: "secret" })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it("nickname이 없으면 400을 반환한다", async () => {
      const res = await request(app.getHttpServer())
        .post("/rooms")
        .send({ role: "speaker" })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it("서비스 오류 시 500과 일관된 에러 형식을 반환한다", async () => {
      mockRoomService.createRoom.mockRejectedValue(new Error("DB connection failed"));

      const res = await request(app.getHttpServer())
        .post("/rooms")
        .send({ nickname: "홍길동", role: "speaker" })
        .expect(500);

      expect(res.body).toMatchObject({
        statusCode: 500,
        message: "Internal server error",
        path: "/rooms"
      });
      expect(res.body).toHaveProperty("timestamp");
    });
  });

  // ─────────────────────────────────────────────
  // POST /rooms/:roomId/join
  // ─────────────────────────────────────────────

  describe("POST /rooms/:roomId/join", () => {
    it("유효한 body로 방에 입장한다", async () => {
      mockRoomService.joinRoom.mockResolvedValue({
        roomId: "room-1",
        inviteCode: "ABC123",
        sessionToken: "session_token2",
        sessionId: "session-2",
        status: "active"
      });

      const res = await request(app.getHttpServer())
        .post("/rooms/room-1/join")
        .send({ nickname: "김철수", role: "deaf" })
        .expect(201);

      expect(res.body).toMatchObject({ roomId: "room-1", status: "active" });
    });

    it("role이 없으면 400을 반환한다", async () => {
      const res = await request(app.getHttpServer())
        .post("/rooms/room-1/join")
        .send({ nickname: "김철수" })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it("NotFoundException이면 404와 일관된 형식을 반환한다", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      mockRoomService.joinRoom.mockRejectedValue(new NotFoundException("Room not found"));

      const res = await request(app.getHttpServer())
        .post("/rooms/nonexistent/join")
        .send({ nickname: "김철수", role: "deaf" })
        .expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        message: "Room not found",
        path: "/rooms/nonexistent/join"
      });
    });
  });

  // ─────────────────────────────────────────────
  // GET /rooms/:roomId
  // ─────────────────────────────────────────────

  describe("GET /rooms/:roomId", () => {
    it("존재하는 방을 조회한다", async () => {
      mockRoomService.getRoom.mockResolvedValue({
        id: "room-1",
        inviteCode: "ABC123",
        status: "waiting",
        participants: [],
        startedAt: null,
        endedAt: null
      });

      const res = await request(app.getHttpServer())
        .get("/rooms/room-1")
        .expect(200);

      expect(res.body).toMatchObject({ id: "room-1", inviteCode: "ABC123" });
    });

    it("존재하지 않는 방은 404를 반환한다", async () => {
      const { NotFoundException } = await import("@nestjs/common");
      mockRoomService.getRoom.mockRejectedValue(new NotFoundException("Room not found"));

      const res = await request(app.getHttpServer())
        .get("/rooms/nonexistent")
        .expect(404);

      expect(res.body).toMatchObject({ statusCode: 404 });
    });
  });

  // ─────────────────────────────────────────────
  // GET /rooms/invite/:inviteCode
  // ─────────────────────────────────────────────

  describe("GET /rooms/invite/:inviteCode", () => {
    it("유효한 초대 코드로 방을 조회한다", async () => {
      mockRoomService.getRoomByInviteCode.mockResolvedValue({
        roomId: "room-1",
        inviteCode: "ABC123",
        status: "waiting"
      });

      const res = await request(app.getHttpServer())
        .get("/rooms/invite/ABC123")
        .expect(200);

      expect(res.body).toMatchObject({ roomId: "room-1", inviteCode: "ABC123" });
    });
  });
});
