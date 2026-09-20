"use client";

// Reuses cart-drawer.tsx's fixed-overlay skeleton (the only modal precedent
// in this app) rather than introducing a new dialog pattern.
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { topUpWalletAction } from "@/app/wallet/actions";
import { useT } from "@/lib/i18n/client";

export function AddMoneyModal({ onClose }: { onClose: () => void }) {
  const t = useT();

  return (
    <div className="animate-fade-in fixed inset-0 z-30 flex items-center justify-center bg-brand-green-950/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="animate-pop-in w-full max-w-sm rounded-2xl border border-brand-green-900/10 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">{t("wallet.addMoney")}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </Button>
        </div>
        <ActionForm action={topUpWalletAction} onSuccess={onClose}>
          <Label htmlFor="add-money-amount">{t("wallet.amount")}</Label>
          <Input
            id="add-money-amount"
            name="amount"
            type="number"
            min="1"
            step="0.01"
            required
            className="mb-3 mt-1"
          />
          <SubmitButton
            className="w-full"
            label={t("wallet.confirmAddMoney")}
            pendingLabel={t("wallet.submitting")}
          />
        </ActionForm>
      </div>
    </div>
  );
}
