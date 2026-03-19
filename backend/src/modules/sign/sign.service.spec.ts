import { Test } from "@nestjs/testing";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { SignService } from "./sign.service";

const makeMockPrisma = () => ({
  messageEvent: {
    create: jest.fn()
  }
});

describe("SignService", () => {
  let service: SignService;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(async () => {
    prisma = makeMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        SignService,
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    service = module.get(SignService);
  });

  describe("saveSignCaption", () => {
    it("확정 수화 인식 결과를 MessageEvent (sign_intent)로 저장한다", async () => {
      prisma.messageEvent.create.mockResolvedValue({ id: "msg-1" });

      await service.saveSignCaption({
        roomId: "room-1",
        sessionId: "session-1",
        content: "안녕하세요",
        confidence: 0.9
      });

      expect(prisma.messageEvent.create).toHaveBeenCalledWith({
        data: {
          roomId: "room-1",
          senderSessionId: "session-1",
          content: "안녕하세요",
          messageType: "sign_intent"
        }
      });
    });

    it("DB 오류가 발생해도 예외를 throw하지 않는다", async () => {
      prisma.messageEvent.create.mockRejectedValue(new Error("DB connection error"));

      await expect(
        service.saveSignCaption({
          roomId: "room-1",
          sessionId: "session-1",
          content: "안녕",
          confidence: 0.8
        })
      ).resolves.toBeUndefined();
    });

    it("빈 문자열 content도 저장을 시도한다", async () => {
      prisma.messageEvent.create.mockResolvedValue({ id: "msg-2" });

      await service.saveSignCaption({
        roomId: "room-1",
        sessionId: "session-1",
        content: "",
        confidence: 0.7
      });

      expect(prisma.messageEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ content: "" }) })
      );
    });
  });
});
