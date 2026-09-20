"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AddMoneyModal } from "@/components/buyer/wallet/add-money-modal";
import { WithdrawModal } from "@/components/buyer/wallet/withdraw-modal";
import { useT } from "@/lib/i18n/client";

export function WalletActions() {
  const t = useT();
  const [modal, setModal] = useState<"add" | "withdraw" | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setModal("add")}>{t("wallet.addMoney")}</Button>
        <Button variant="outline" onClick={() => setModal("withdraw")}>
          {t("wallet.withdraw")}
        </Button>
      </div>
      {modal === "add" && <AddMoneyModal onClose={() => setModal(null)} />}
      {modal === "withdraw" && <WithdrawModal onClose={() => setModal(null)} />}
    </>
  );
}
