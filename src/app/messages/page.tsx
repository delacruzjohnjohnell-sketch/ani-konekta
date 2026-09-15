import Link from "next/link";
import { auth } from "@/lib/auth";
import { listConversationsForUser } from "@/lib/messaging";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function MessagesInboxPage() {
  const session = await auth();
  const user = session!.user;
  const locale = await getLocale();
  const conversations = await listConversationsForUser(user.id, user.role);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">{t("messages.inbox.title", locale)}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("messages.inbox.title", locale)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {conversations.length === 0 && (
            <p className="text-sm text-neutral-500">{t("messages.inbox.empty", locale)}</p>
          )}
          {conversations.map((c) => {
            const counterpart = user.role === "BUYER" ? c.seller : c.buyer;
            return (
              <Link
                key={c.id}
                href={`/messages/${c.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-black/10 p-3 hover:border-brand-green-700"
              >
                <div>
                  <p className={c.unread ? "font-bold text-neutral-900" : "font-medium text-neutral-900"}>
                    {counterpart.name}
                    {c.order && ` · ${c.order.listing.cropType}`}
                  </p>
                  <p className="truncate text-sm text-neutral-500">
                    {c.lastMessage?.body ?? t("messages.inbox.noMessagesYet", locale)}
                  </p>
                </div>
                {c.unread && <Badge tone="gold">{t("messages.inbox.unread", locale)}</Badge>}
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
