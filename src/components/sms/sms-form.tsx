"use client";

import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { simulateInboundSms } from "@/app/sms/actions";
import { useT } from "@/lib/i18n/client";

export function SmsForm({ isAdmin, ownPhone }: { isAdmin: boolean; ownPhone: string }) {
  const t = useT();

  return (
    <Card>
      <CardContent className="pt-5">
        <ActionForm action={simulateInboundSms}>
          <div className="space-y-3">
            <div>
              <Label htmlFor="sms-phone">{t("sms.fromPhone")}</Label>
              {isAdmin ? (
                <Input id="sms-phone" name="phone" placeholder={ownPhone} className="mt-1" />
              ) : (
                <Input id="sms-phone" name="phone" value={ownPhone} disabled className="mt-1" />
              )}
            </div>
            <div>
              <Label htmlFor="sms-body">{t("sms.body")}</Label>
              <Textarea
                id="sms-body"
                name="body"
                placeholder="LIST Onion 100 90"
                rows={2}
                required
                className="mt-1"
              />
            </div>
            <SubmitButton label={t("sms.send")} pendingLabel={t("sms.sending")} />
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
