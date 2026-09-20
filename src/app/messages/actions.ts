"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/app/actions";
import { getOrCreateConversation, markConversationRead } from "@/lib/messaging";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import type { ActionState } from "@/components/ui/action-form";

/**
 * Any role: start (or jump into an existing) conversation with a
 * counterpart. Called from a listing card ("Message Seller" — buyer only,
 * pre-order) or an order detail view (either buyer or seller, order-scoped).
 * Always redirects into the resulting thread.
 */
export async function startConversation(formData: FormData) {
  const user = await requireUser();
  const counterpartId = String(formData.get("counterpartId"));
  const orderId = String(formData.get("orderId") ?? "") || null;

  const buyerId = user.role === "BUYER" ? user.id : counterpartId;
  const sellerId = user.role === "BUYER" ? counterpartId : user.id;
  if (user.role !== "BUYER" && user.role !== "SELLER" && user.role !== "COOPERATIVE_ADMIN") {
    throw new Error("Only buyers and sellers (or cooperative admins) can message each other.");
  }

  const conversation = await getOrCreateConversation(buyerId, sellerId, orderId);
  redirect(`/messages/${conversation.id}`);
}

export async function sendMessage(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = await getLocale();
  const user = await requireUser();
  const conversationId = String(formData.get("conversationId"));
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    return { error: t("messages.error.empty", locale) };
  }

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  });
  const isParticipant = conversation.buyerId === user.id || conversation.sellerId === user.id;
  if (!isParticipant) {
    return { error: t("messages.error.notParticipant", locale) };
  }

  await prisma.message.create({
    data: { conversationId, senderId: user.id, body },
  });
  // Sending counts as reading your own thread up to now.
  await markConversationRead(conversationId, user.id, user.role);

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
  return { success: true };
}
