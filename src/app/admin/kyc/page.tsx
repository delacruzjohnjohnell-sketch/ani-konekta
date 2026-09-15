import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { scheduleKycVisit, recordKycVisitOutcome } from "@/app/admin/kyc/actions";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function AdminKycPage() {
  const locale = await getLocale();
  const openVisits = await prisma.kycVisit.findMany({
    where: { status: { in: ["VISIT_SCHEDULED", "UNDER_REVIEW"] } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">{t("admin.kyc.title", locale)}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.kyc.scheduleTitle", locale)}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={scheduleKycVisit} className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">{t("admin.kyc.userPhone", locale)}</Label>
              <Input id="phone" name="phone" placeholder="09171234567" required />
            </div>
            <div>
              <Label htmlFor="visitDate">{t("admin.kyc.visitDate", locale)}</Label>
              <Input id="visitDate" name="visitDate" type="date" />
            </div>
            <div className="col-span-2">
              <Button type="submit">{t("admin.kyc.schedule", locale)}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-brand-gold-400 to-brand-gold-700" />
        <CardHeader>
          <CardTitle>{t("admin.kyc.openVisits", locale)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {openVisits.length === 0 && (
            <p className="text-sm text-neutral-500">{t("admin.kyc.noOpenVisits", locale)}</p>
          )}
          {openVisits.map((v) => (
            <div key={v.id} className="rounded-lg border border-black/10 p-4">
              <p className="font-medium text-neutral-900">
                {v.user.name} · {v.user.role} · {v.user.phone}
              </p>
              <p className="text-sm text-neutral-500">
                {t(`verification.kyc.${v.status}`, locale)}
                {v.visitDate ? ` · ${v.visitDate.toISOString().slice(0, 10)}` : ""}
              </p>
              <form action={recordKycVisitOutcome} className="mt-3 grid grid-cols-2 gap-3">
                <input type="hidden" name="visitId" value={v.id} />
                <div>
                  <Label htmlFor={`verifierName-${v.id}`}>{t("admin.kyc.verifierName", locale)}</Label>
                  <Input id={`verifierName-${v.id}`} name="verifierName" defaultValue={v.verifierName ?? ""} />
                </div>
                <div>
                  <Label htmlFor={`status-${v.id}`}>{t("admin.kyc.outcomeStatus", locale)}</Label>
                  <Select id={`status-${v.id}`} name="status" defaultValue="UNDER_REVIEW">
                    <option value="UNDER_REVIEW">{t("verification.kyc.UNDER_REVIEW", locale)}</option>
                    <option value="KYC_VERIFIED">{t("verification.kyc.KYC_VERIFIED", locale)}</option>
                    <option value="REJECTED">{t("verification.kyc.REJECTED", locale)}</option>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor={`notes-${v.id}`}>{t("admin.kyc.notes", locale)}</Label>
                  <Input id={`notes-${v.id}`} name="notes" defaultValue={v.notes ?? ""} />
                </div>
                <div className="col-span-2">
                  <PhotoUpload name="evidence" label={t("admin.kyc.evidence", locale)} />
                </div>
                <div className="col-span-2">
                  <Button type="submit" size="sm">
                    {t("admin.kyc.recordOutcome", locale)}
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
