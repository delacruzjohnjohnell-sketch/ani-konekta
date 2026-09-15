import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { SmsForm } from "@/components/sms/sms-form";

export default async function SmsPage() {
  const [session, locale] = await Promise.all([auth(), getLocale()]);
  if (!session?.user) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const isAdmin = session.user.role === "ADMIN";

  const messages = await prisma.smsMessage.findMany({
    where: isAdmin ? {} : { phone: dbUser.phone },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("sms.title", locale)}</h1>
      </div>

      <div
        role="status"
        className="rounded-lg border border-brand-gold-300 bg-brand-gold-50 px-4 py-3 text-sm font-medium text-brand-gold-900"
      >
        ⚠️ {t("sms.banner", locale)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sms.instructions", locale)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-neutral-600">
          <p>{t("sms.grammar.list", locale)}</p>
          <p>{t("sms.grammar.order", locale)}</p>
        </CardContent>
      </Card>

      <SmsForm isAdmin={isAdmin} ownPhone={dbUser.phone} />

      <Card>
        <CardHeader>
          <CardTitle>{t("sms.log.title", locale)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {messages.length === 0 && (
            <p className="text-sm text-neutral-500">{t("sms.log.empty", locale)}</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="rounded-lg border border-black/10 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                <span>
                  {m.direction === "IN" ? t("sms.log.in", locale) : t("sms.log.out", locale)} ·{" "}
                  {m.phone}
                </span>
                <span>{m.createdAt.toLocaleString()}</span>
              </div>
              <p className="text-neutral-900">{m.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
