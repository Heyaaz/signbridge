import { Module } from "@nestjs/common";
import { QuickReplyController } from "./quick-reply.controller";
import { QuickReplyService } from "./quick-reply.service";

@Module({
  controllers: [QuickReplyController],
  providers: [QuickReplyService]
})
export class QuickReplyModule {}

