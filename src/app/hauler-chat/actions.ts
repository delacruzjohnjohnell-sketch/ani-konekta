"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHaulerChatAccess, type HaulerChatRole } from "@/lib/hauler-messaging";
import type { ActionState } from "@/components/ui/action-form";

// FEATURE 4 — In-App Chat: plain-text only (React escapes all rendered
// text by default — no dangerouslySetInnerHTML anywhere near these
// messages), with a length cap as the "basic safety" the spec asks for.
const MAX_MESSAGE_LENGTH = 2000;

export async function sendHaulerMessage(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in." };

  const orderId = String(formData.get("orderId") ?? "");
  const chatRole = String(formData.get("chatRole") ?? "") as HaulerChatRole;
  const body = String(formData.get("body") ?? "").trim();

  if (chatRole !== "HAULER_TO_BUYER" && chatRole !== "HAULER_TO_SELLER") {
    return { error: "Invalid thread." };
  }
  if (!body) return { error: "Type a message before sending." };
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` };
  }

  const access = await getHaulerChatAccess(orderId, session.user.id, session.user.role, chatRole);
  if (!access.canSend || !access.counterpartId) {
    return { error: "You can't send a message on this order right now." };
  }

  await prisma.haulerMessage.create({
    data: {
      orderId,
      senderId: session.user.id,
      senderRole: session.user.role as never,
      recipientId: access.counterpartId,
      body,
    },
  });

  revalidatePath(`/buyer/order/${orderId}`);
  revalidatePath(`/order/${orderId}`);
  revalidatePath("/hauler/dashboard");
  return { success: true };
}
