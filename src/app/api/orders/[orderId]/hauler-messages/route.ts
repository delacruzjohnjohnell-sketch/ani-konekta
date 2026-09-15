import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getHaulerChatAccess,
  listHaulerMessages,
  markHaulerThreadRead,
  type HaulerChatRole,
} from "@/lib/hauler-messaging";

// FEATURE 4 — In-App Chat: polled by the chat panel every 7s while a
// thread is open (confirmed default — the spec's own suggested 5-10s
// range). Marks the thread read as a side effect of a successful fetch,
// matching "mark messages as read when the recipient opens that order's
// thread" — polling while the panel is mounted IS "the thread is open".
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const chatRole = request.nextUrl.searchParams.get("chatRole") as HaulerChatRole | null;
  if (chatRole !== "HAULER_TO_BUYER" && chatRole !== "HAULER_TO_SELLER") {
    return NextResponse.json({ error: "chatRole required." }, { status: 400 });
  }

  const access = await getHaulerChatAccess(orderId, session.user.id, session.user.role, chatRole);
  if (!access.canView || !access.counterpartId) {
    return NextResponse.json({ error: "Not authorized for this thread." }, { status: 403 });
  }

  await markHaulerThreadRead(orderId, access.counterpartId, session.user.id);
  const messages = await listHaulerMessages(orderId, session.user.id, access.counterpartId);

  return NextResponse.json({
    canSend: access.canSend,
    counterpartName: access.counterpartName,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.senderId,
      senderRole: m.senderRole,
      createdAt: m.createdAt,
    })),
  });
}
