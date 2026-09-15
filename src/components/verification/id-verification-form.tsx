"use client";

import { submitIdVerification } from "@/app/verification/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { PhotoUpload } from "@/components/ui/photo-upload";
import { Input, Label } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";

/** Reused identically by the seller/buyer/hauler dashboards (Phase 6). */
export function IdVerificationForm() {
  const t = useT();
  return (
    <ActionForm action={submitIdVerification} className="space-y-3">
      <PhotoUpload name="idDocument" label={t("verification.field.document")} required />
      <div>
        <Label htmlFor="note">{t("verification.field.note")}</Label>
        <Input id="note" name="note" />
      </div>
      <SubmitButton
        className="w-full"
        label={t("verification.submit")}
        pendingLabel={t("verification.submit.submitting")}
      />
    </ActionForm>
  );
}
