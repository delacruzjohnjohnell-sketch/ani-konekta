import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IdVerificationForm } from "@/components/verification/id-verification-form";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

const ID_TONE: Record<string, "gray" | "gold" | "green" | "red"> = {
  NOT_VERIFIED: "gray",
  PENDING: "gold",
  VERIFIED: "green",
  REJECTED: "red",
};
const KYC_TONE: Record<string, "gray" | "gold" | "green" | "red"> = {
  NOT_VERIFIED: "gray",
  VISIT_SCHEDULED: "gold",
  UNDER_REVIEW: "gold",
  KYC_VERIFIED: "green",
  REJECTED: "red",
};

/**
 * Own-status card, reused identically by seller/buyer/hauler dashboards
 * (Phase 6). Shows the user's REAL, uncollapsed status — the 3-state
 * collapse ("✓ KYC Verified" / "Verification Pending" / "Not Yet Verified")
 * is only for the public buyer-facing marketplace (see
 * src/lib/verification-badge.ts, Phase 7).
 */
export async function VerificationStatusCard({
  idVerificationStatus,
  kycStatus,
}: {
  idVerificationStatus: string;
  kycStatus: string;
}) {
  const locale = await getLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("verification.title", locale)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-600">{t("verification.idStatus", locale)}:</span>
          <Badge tone={ID_TONE[idVerificationStatus] ?? "gray"}>
            {t(`verification.status.${idVerificationStatus}`, locale)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-600">{t("verification.kycStatus", locale)}:</span>
          <Badge tone={KYC_TONE[kycStatus] ?? "gray"}>
            {t(`verification.kyc.${kycStatus}`, locale)}
          </Badge>
        </div>
        {(idVerificationStatus === "NOT_VERIFIED" || idVerificationStatus === "REJECTED") && (
          <IdVerificationForm />
        )}
        {idVerificationStatus === "PENDING" && (
          <p className="text-xs text-neutral-400">{t("verification.pendingHint", locale)}</p>
        )}
      </CardContent>
    </Card>
  );
}
