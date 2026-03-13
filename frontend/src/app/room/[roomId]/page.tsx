import { CallLayout } from "@/components/call/call-layout";

interface RoomPageProps {
  params: Promise<{
    roomId: string;
  }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;

  return <CallLayout roomId={roomId} />;
}

