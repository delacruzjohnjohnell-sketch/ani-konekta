import { prisma } from "@/lib/prisma";

/**
 * Idempotency-guard pattern (findFirst then create) — same shape already
 * used for CommissionConfig seeding. orderId=null is the durable general
 * pre-order/listing-inquiry thread for a (buyer, seller) pair; a real Order
 * gets its own order-scoped thread, created lazily on first message in that
 * context. Postgres treats multiple NULLs in the @@unique([buyerId,
 * sellerId, orderId]) index as distinct, so this guard is what actually
 * enforces "one general thread per pair."
 */
export async function getOrCreateConversation(
  buyerId: string,
  sellerId: string,
  orderId?: string | null
) {
  const existing = await prisma.conversation.findFirst({
    where: { buyerId, sellerId, orderId: orderId ?? null },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { buyerId, sellerId, orderId: orderId ?? null },
  });
}

export async function listConversationsForUser(userId: string, role: string) {
  const conversations = await prisma.conversation.findMany({
    where: role === "BUYER" ? { buyerId: userId } : { sellerId: userId },
    include: {
      buyer: true,
      seller: true,
      order: { include: { listing: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return conversations
    .map((c) => {
      const lastMessage = c.messages[0] ?? null;
      const lastReadAt = role === "BUYER" ? c.buyerLastReadAt : c.sellerLastReadAt;
      const unread = !!lastMessage && lastMessage.senderId !== userId &&
        (!lastReadAt || lastMessage.createdAt > lastReadAt);
      return { ...c, lastMessage, unread };
    })
    .sort((a, b) => {
      const at = a.lastMessage?.createdAt ?? a.createdAt;
      const bt = b.lastMessage?.createdAt ?? b.createdAt;
      return bt.getTime() - at.getTime();
    });
}

export async function countUnreadForUser(userId: string, role: string): Promise<number> {
  const list = await listConversationsForUser(userId, role);
  return list.filter((c) => c.unread).length;
}

export async function markConversationRead(conversationId: string, userId: string, role: string) {
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  const isParticipant =
    (role === "BUYER" && conversation.buyerId === userId) ||
    (role !== "BUYER" && conversation.sellerId === userId); // SELLER or COOPERATIVE_ADMIN
  if (!isParticipant) throw new Error("Not a participant in this conversation.");

  await prisma.conversation.update({
    where: { id: conversationId },
    data: role === "BUYER" ? { buyerLastReadAt: new Date() } : { sellerLastReadAt: new Date() },
  });
}
