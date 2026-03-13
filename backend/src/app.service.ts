import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: "signbridge-backend",
      status: "skeleton"
    };
  }
}

