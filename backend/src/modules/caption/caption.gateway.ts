import { WebSocketGateway } from "@nestjs/websockets";

@WebSocketGateway({
  namespace: "caption",
  cors: {
    origin: "*"
  }
})
export class CaptionGateway {}

