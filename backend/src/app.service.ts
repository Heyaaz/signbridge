import { Injectable } from "@nestjs/common";
import { PrismaService } from "./infra/prisma/prisma.service";

@Injectable()
export class AppService {
  constructor(private readonly prismaService: PrismaService) {}

  async getHealth() {
    const databaseConnected = await this.checkDatabaseConnection();

    return {
      service: "signbridge-backend",
      status: "ready",
      databaseConnected
    };
  }

  private async checkDatabaseConnection() {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;

      return true;
    } catch {
      return false;
    }
  }
}
