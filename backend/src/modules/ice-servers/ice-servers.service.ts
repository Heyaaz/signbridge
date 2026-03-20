import { Injectable } from "@nestjs/common";

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServer[];
}

const DEFAULT_STUN: IceServer = {
  urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
};

@Injectable()
export class IceServersService {
  // 환경 변수는 앱 시작 후 변하지 않으므로 초기화 시 한 번만 파싱
  private readonly cachedResponse: IceServersResponse;

  constructor() {
    this.cachedResponse = this.buildIceServers();
  }

  getIceServers(): IceServersResponse {
    return this.cachedResponse;
  }

  private buildIceServers(): IceServersResponse {
    const iceServers: IceServer[] = [DEFAULT_STUN];

    const turnUrls = process.env.TURN_URLS;
    const turnUsername = process.env.TURN_USERNAME;
    const turnCredential = process.env.TURN_CREDENTIAL;

    if (turnUrls && turnUsername && turnCredential) {
      const urls = turnUrls
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url.startsWith("turn:") || url.startsWith("turns:"));

      if (urls.length > 0) {
        iceServers.push({ urls, username: turnUsername, credential: turnCredential });
      }
    }

    return { iceServers };
  }
}
