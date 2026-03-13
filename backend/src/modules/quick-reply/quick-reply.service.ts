import { Injectable } from "@nestjs/common";

@Injectable()
export class QuickReplyService {
  getQuickReplies() {
    return [
      "다시 말씀해 주세요",
      "천천히 말씀해 주세요",
      "잠시만 기다려 주세요",
      "이해했습니다"
    ];
  }
}

