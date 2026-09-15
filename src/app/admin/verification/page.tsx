import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { reviewIdVerification } from "@/app/admin/verification/actions";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function AdminVerificationPage() {
  const locale = await getLocale();
  const pending = await prisma.idVerificationSubmission.findMany({
    where: { status: "PENDING" },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">{t("admin.verification.title", locale)}</h1>

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
        <CardHeader>
          <CardTitle>{t("admin.verification.title", locale)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 && (
            <p className="text-sm text-neutral-500">{t("admin.verification.noPending", locale)}</p>
          )}
          {pending.map((s) => (
            <div key={s.id} className="rounded-lg border border-black/10 p-4">
              <p className="font-medium text-neutral-900">
                {s.user.name} · {s.user.role} · {s.user.phone}
              </p>
              {s.note && <p className="text-sm text-neutral-500">{s.note}</p>}
              <a
                href={`/api/secure-doc/id-verification/${s.id}?index=0`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-brand-green-700 hover:underline"
              >
                {t("admin.verification.viewDocument", locale)} →
              </a>
              <form action={reviewIdVerification} className="mt-3 space-y-2">
                <input type="hidden" name="submissionId" value={s.id} />
                <div>
                  <Label htmlFor={`reviewNote-${s.id}`}>{t("admin.verification.reviewNote", locale)}</Label>
                  <Input id={`reviewNote-${s.id}`} name="reviewNote" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" name="decision" value="VERIFIED" size="sm">
                    {t("admin.verification.approve", locale)}
                  </Button>
                  <Button type="submit" name="decision" value="REJECTED" variant="danger" size="sm">
                    {t("admin.verification.reject", locale)}
                  </Button>
                </div>
              </form>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
