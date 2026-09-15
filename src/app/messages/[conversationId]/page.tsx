import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markConversationRead } from "@/lib/messaging";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageComposer } from "@/components/messages/message-composer";
import { cn } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const session = await auth();
  const user = session!.user;
  const locale = await getLocale();

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      buyer: true,
      seller: true,
      order: { include: { listing: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: true } },
    },
  });

  const isParticipant = conversation.buyerId === user.id || conversation.sellerId === user.id;
  if (!isParticipant) {
    return <p className="mx-auto max-w-2xl px-4 py-8 text-sm text-red-600">{t("messages.error.notParticipant", locale)}</p>;
  }

  await markConversationRead(conversationId, user.id, user.role);
  const counterpart = user.role === "BUYER" ? conversation.seller : conversation.buyer;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <Link href="/messages" className="text-sm text-brand-green-700 hover:underline">
        ← {t("messages.inbox.title", locale)}
      </Link>
      <Card className="flex h-[70vh] flex-col overflow-hidden">
        <CardHeader>
          <CardTitle>
            {counterpart.name}
            {conversation.order && ` · ${conversation.order.listing.cropType}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-2 overflow-y-auto">
          {conversation.messages.length === 0 && (
            <p className="text-sm text-neutral-500">{t("messages.inbox.noMessagesYet", locale)}</p>
          )}
          {conversation.messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                m.senderId === user.id
                  ? "ml-auto bg-brand-green-700 text-white"
                  : "bg-neutral-100 text-neutral-900"
              )}
            >
              {m.body}
            </div>
          ))}
        </CardContent>
        <MessageComposer conversationId={conversation.id} />
      </Card>
    </div>
  );
}
