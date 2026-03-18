import { Module } from "@nestjs/common";
import { SignGateway } from "./sign.gateway";
import { SignService } from "./sign.service";

@Module({
  providers: [SignGateway, SignService]
})
export class SignModule {}
