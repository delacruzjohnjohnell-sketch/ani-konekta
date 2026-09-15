import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateWallet } from "@/lib/wallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPeso } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { WalletActions } from "@/components/buyer/wallet/wallet-actions";

export default async function WalletPage() {
  const [session, locale] = await Promise.all([auth(), getLocale()]);
  if (!session?.user || session.user.role !== "BUYER") {
    redirect("/login");
  }

  const wallet = await getOrCreateWallet(session.user.id);
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("wallet.title", locale)}</h1>
        <p className="text-sm text-neutral-500">{t("wallet.subtitle", locale)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">{t("wallet.available", locale)}</p>
            <p className="mt-1 text-xl font-bold text-brand-green-700">
              {formatPeso(wallet.availableBalancePHP)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">{t("wallet.protected", locale)}</p>
            <p className="mt-1 text-xl font-bold text-brand-gold-600">
              {formatPeso(wallet.protectedBalancePHP)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-neutral-500">{t("wallet.pending", locale)}</p>
            <p className="mt-1 text-xl font-bold text-neutral-900">
              {formatPeso(wallet.pendingBalancePHP)}
            </p>
          </CardContent>
        </Card>
      </div>

      <WalletActions />

      <Card>
        <CardHeader>
          <CardTitle>{t("wallet.transactionHistory", locale)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {transactions.length === 0 && (
            <p className="text-sm text-neutral-500">{t("wallet.noTransactions", locale)}</p>
          )}
          {transactions.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center justify-between border-b border-black/5 py-2 text-sm last:border-0"
            >
              <div>
                <p className="font-medium text-neutral-900">{t(`wallet.txn.${txn.type}`, locale)}</p>
                <p className="text-xs text-neutral-500">{txn.createdAt.toLocaleString()}</p>
              </div>
              <span
                className={
                  txn.type === "WITHDRAWAL" || txn.type === "HOLD"
                    ? "font-semibold text-red-600"
                    : "font-semibold text-brand-green-700"
                }
              >
                {txn.type === "WITHDRAWAL" || txn.type === "HOLD" ? "− " : "+ "}
                {formatPeso(txn.amountPHP)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
