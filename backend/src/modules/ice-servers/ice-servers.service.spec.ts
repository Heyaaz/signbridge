import { Test } from "@nestjs/testing";
import { IceServersService } from "./ice-servers.service";

describe("IceServersService", () => {
  let service: IceServersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [IceServersService]
    }).compile();

    service = module.get(IceServersService);
  });

  afterEach(() => {
    delete process.env.TURN_URLS;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;
  });

  it("TURN 환경변수 없으면 STUN만 반환한다", () => {
    const { iceServers } = service.getIceServers();

    expect(iceServers).toHaveLength(1);
    expect(iceServers[0]?.urls).toContain("stun:stun.l.google.com:19302");
    expect(iceServers[0]?.username).toBeUndefined();
  });

  it("TURN 환경변수 있으면 STUN + TURN 반환한다", () => {
    process.env.TURN_URLS = "turn:turn.example.com:3478,turns:turn.example.com:5349";
    process.env.TURN_USERNAME = "user";
    process.env.TURN_CREDENTIAL = "secret";

    const { iceServers } = service.getIceServers();

    expect(iceServers).toHaveLength(2);
    expect(iceServers[1]?.urls).toEqual([
      "turn:turn.example.com:3478",
      "turns:turn.example.com:5349"
    ]);
    expect(iceServers[1]?.username).toBe("user");
    expect(iceServers[1]?.credential).toBe("secret");
  });

  it("TURN_URLS만 있고 credential이 없으면 STUN만 반환한다", () => {
    process.env.TURN_URLS = "turn:turn.example.com:3478";

    const { iceServers } = service.getIceServers();

    expect(iceServers).toHaveLength(1);
  });
});
