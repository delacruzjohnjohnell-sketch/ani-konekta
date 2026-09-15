import { prisma } from "@/lib/prisma";

// FEATURE 4 — In-App Chat (Hauler <-> Seller, Hauler <-> Buyer).
//
// Access rule (enforced here, server-side, for both read and send):
// Hauler<->Buyer and Hauler<->Seller messaging on an order is allowed only
// while the hauler is CURRENTLY assigned to the route carrying that order
// (order.route.haulerId === this hauler), from POOLED through DELIVERED.
// A hauler reassigned off a route loses SEND access going forward (this
// check re-runs on every send, not just the first message) but existing
// messages remain visible to everyone who was ever a party to them, for
// record-keeping — per the explicit decision documented in the spec
// response, kept read-only rather than hidden after SETTLED (see
// canSendOnOrder below).
export type HaulerChatRole = "HAULER_TO_BUYER" | "HAULER_TO_SELLER";

export type ChatAccess = {
  canView: boolean;
  canSend: boolean;
  counterpartId: string | null;
  counterpartName: string | null;
};

/**
 * Resolves what the given viewer may do on a given order's hauler-chat
 * thread(s). A BUYER only ever has a HAULER_TO_BUYER thread; a SELLER only
 * HAULER_TO_SELLER; a HAULER has both (pass `chatRole` to pick which); an
 * ADMIN may view both, read-only.
 */
export async function getHaulerChatAccess(
  orderId: string,
  viewerId: string,
  viewerRole: string,
  chatRole: HaulerChatRole
): Promise<ChatAccess> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { route: true, buyer: true, seller: true },
  });
  if (!order) return { canView: false, canSend: false, counterpartId: null, counterpartName: null };

  const haulerId = order.route?.haulerId ?? null;
  const isCurrentHauler = haulerId != null && haulerId === viewerId;
  const isBuyer = order.buyerId === viewerId;
  const isSeller = order.sellerId === viewerId;
  const isAdmin = viewerRole === "ADMIN";

  // Who is even allowed to look at this specific thread.
  const authorizedViewer =
    (chatRole === "HAULER_TO_BUYER" && (isBuyer || isCurrentHauler || isAdmin)) ||
    (chatRole === "HAULER_TO_SELLER" && (isSeller || isCurrentHauler || isAdmin));
  if (!authorizedViewer) {
    return { canView: false, canSend: false, counterpartId: null, counterpartName: null };
  }

  const counterpart =
    chatRole === "HAULER_TO_BUYER"
      ? isCurrentHauler || isAdmin
        ? { id: order.buyer.id, name: order.buyer.name }
        : haulerId
          ? { id: haulerId, name: "Hauler" }
          : null
      : isCurrentHauler || isAdmin
        ? { id: order.seller.id, name: order.seller.name }
        : haulerId
          ? { id: haulerId, name: "Hauler" }
          : null;

  // Sending requires: a hauler is actually assigned to this order right
  // now, the order hasn't been cancelled, and — per the documented
  // decision — stays open through DELIVERED but goes read-only once
  // SETTLED. ADMIN never sends (view-only, for oversight/dispute review).
  const hasActiveHauler = haulerId != null;
  const notSettled = order.status !== "SETTLED";
  const canSend =
    !isAdmin &&
    hasActiveHauler &&
    notSettled &&
    ((chatRole === "HAULER_TO_BUYER" && (isBuyer || isCurrentHauler)) ||
      (chatRole === "HAULER_TO_SELLER" && (isSeller || isCurrentHauler)));

  return {
    canView: true,
    canSend,
    counterpartId: counterpart?.id ?? null,
    counterpartName: counterpart?.name ?? null,
  };
}

export async function listHaulerMessages(orderId: string, userAId: string, userBId: string) {
  return prisma.haulerMessage.findMany({
    where: {
      orderId,
      OR: [
        { senderId: userAId, recipientId: userBId },
        { senderId: userBId, recipientId: userAId },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function markHaulerThreadRead(orderId: string, counterpartId: string, viewerId: string) {
  await prisma.haulerMessage.updateMany({
    where: { orderId, senderId: counterpartId, recipientId: viewerId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Total unread hauler-chat messages addressed to this user, across every order. */
export async function countUnreadHaulerMessages(userId: string): Promise<number> {
  return prisma.haulerMessage.count({ where: { recipientId: userId, readAt: null } });
}
