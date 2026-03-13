import { Controller, Get } from "@nestjs/common";
import { QuickReplyService } from "./quick-reply.service";

@Controller("quick-replies")
export class QuickReplyController {
  constructor(private readonly quickReplyService: QuickReplyService) {}

  @Get()
  getQuickReplies() {
    return this.quickReplyService.getQuickReplies();
  }
}

