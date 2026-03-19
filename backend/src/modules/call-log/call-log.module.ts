import { Module } from "@nestjs/common";
import { CallLogService } from "./call-log.service";

@Module({
  providers: [CallLogService],
  exports: [CallLogService]
})
export class CallLogModule {}
