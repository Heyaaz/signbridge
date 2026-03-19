import { Test } from "@nestjs/testing";
import { RoomStatus } from "@prisma/client";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { CallLogService } from "./call-log.service";

const makeMockPrisma = (overrides: Partial<Record<string, unknown>> = {}) => ({
  room: {
    findUnique: jest.fn()
  },
  callLog: {
    findFirst: jest.fn(),
    create: jest.fn()
  },
  captionEvent: {
    count: jest.fn()
  },
  messageEvent: {
    count: jest.fn()
  },
  ...overrides
});

describe("CallLogService", () => {
  let service: CallLogService;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(async () => {
    prisma = makeMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        CallLogService,
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    service = module.get(CallLogService);
  });

  describe("createForRoom", () => {
    it("방이 존재하지 않으면 아무것도 하지 않는다", async () => {
      prisma.room.findUnique.mockResolvedValue(null);

      await service.createForRoom("room-1", "manual");

      expect(prisma.callLog.create).not.toHaveBeenCalled();
    });

    it("방이 ended 상태가 아니면 아무것도 하지 않는다", async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        status: RoomStatus.active,
        startedAt: new Date()
      });

      await service.createForRoom("room-1", "manual");

      expect(prisma.callLog.create).not.toHaveBeenCalled();
    });

    it("DB unique constraint 위반(P2002)이면 중복 생성 없이 정상 종료한다", async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        status: RoomStatus.ended,
        startedAt: new Date(),
        endedAt: new Date()
      });
      prisma.captionEvent.count.mockResolvedValue(0);
      prisma.messageEvent.count.mockResolvedValue(0);

      const p2002Error = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      prisma.callLog.create.mockRejectedValue(p2002Error);

      await expect(service.createForRoom("room-1", "manual")).resolves.toBeUndefined();
    });

    it("P2002 외의 DB 오류는 rethrow한다", async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        status: RoomStatus.ended,
        startedAt: new Date(),
        endedAt: new Date()
      });
      prisma.captionEvent.count.mockResolvedValue(0);
      prisma.messageEvent.count.mockResolvedValue(0);

      const dbError = Object.assign(new Error("Connection failed"), { code: "P1001" });
      prisma.callLog.create.mockRejectedValue(dbError);

      await expect(service.createForRoom("room-1", "manual")).rejects.toThrow("Connection failed");
    });

    it("정상적으로 CallLog를 생성한다", async () => {
      const startedAt = new Date(Date.now() - 60_000); // 60초 전
      const endedAt = new Date(Date.now() - 1_000);    // 1초 전
      prisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        status: RoomStatus.ended,
        startedAt,
        endedAt
      });
      prisma.captionEvent.count.mockResolvedValue(5);
      prisma.messageEvent.count.mockResolvedValue(3);
      prisma.callLog.create.mockResolvedValue({ id: "log-new" });

      await service.createForRoom("room-1", "manual");

      expect(prisma.callLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          roomId: "room-1",
          captionCount: 5,
          messageCount: 3,
          endReason: "manual",
          durationSec: 59 // endedAt - startedAt = 59초
        })
      });
    });

    it("startedAt이 없으면 durationSec를 0으로 저장한다", async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        status: RoomStatus.ended,
        startedAt: null,
        endedAt: new Date()
      });
      prisma.callLog.findFirst.mockResolvedValue(null);
      prisma.captionEvent.count.mockResolvedValue(0);
      prisma.messageEvent.count.mockResolvedValue(0);
      prisma.callLog.create.mockResolvedValue({ id: "log-new" });

      await service.createForRoom("room-1", "disconnect");

      expect(prisma.callLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          durationSec: 0,
          endReason: "disconnect"
        })
      });
    });
  });
});
