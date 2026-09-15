"use client";

import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { withdrawFromWalletAction } from "@/app/wallet/actions";
import { useT } from "@/lib/i18n/client";

export function WithdrawModal({ onClose }: { onClose: () => void }) {
  const t = useT();

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">{t("wallet.withdraw")}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </Button>
        </div>
        <ActionForm action={withdrawFromWalletAction} onSuccess={onClose}>
          <Label htmlFor="withdraw-amount">{t("wallet.amount")}</Label>
          <Input
            id="withdraw-amount"
            name="amount"
            type="number"
            min="1"
            step="0.01"
            required
            className="mb-3 mt-1"
          />
          <SubmitButton
            className="w-full"
            variant="outline"
            label={t("wallet.confirmWithdraw")}
            pendingLabel={t("wallet.submitting")}
          />
        </ActionForm>
      </div>
    </div>
  );
}
