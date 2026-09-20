import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateWallet } from "@/lib/wallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPeso } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { WalletActions } from "@/components/buyer/wallet/wallet-actions";
import { PageHeader, StatCard } from "@/components/ui/stat-card";

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
      <PageHeader icon="💳" title={t("wallet.title", locale)} subtitle={t("wallet.subtitle", locale)} />

      {/* Fintech-style balance hero: the spendable balance up front, protected/pending beside it. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
        <div className="harvest-band relative overflow-hidden rounded-2xl p-5 text-white shadow-lift sm:col-span-3 sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-brand-gold-400/30 blur-2xl" />
          <p className="relative text-xs font-medium uppercase tracking-wide text-white/80">{t("wallet.available", locale)}</p>
          <p className="relative mt-2 break-words text-3xl font-bold tracking-tight sm:text-4xl">
            {formatPeso(wallet.availableBalancePHP)}
          </p>
          <p className="relative mt-3 text-xs text-white/75">ANI-Wallet · ready to spend at checkout</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:col-span-2">
          <StatCard icon="🛡️" tone="gold" label={t("wallet.protected", locale)} value={formatPeso(wallet.protectedBalancePHP)} />
          <StatCard icon="⏳" tone="neutral" label={t("wallet.pending", locale)} value={formatPeso(wallet.pendingBalancePHP)} />
        </div>
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
              className="flex items-center justify-between gap-3 border-b border-brand-green-900/5 py-2.5 text-sm last:border-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    txn.type === "WITHDRAWAL" || txn.type === "HOLD"
                      ? "bg-red-50 text-red-600"
                      : "bg-brand-green-100 text-brand-green-700"
                  }`}
                >
                  {txn.type === "WITHDRAWAL" || txn.type === "HOLD" ? "↑" : "↓"}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-900">{t(`wallet.txn.${txn.type}`, locale)}</p>
                  <p className="text-xs text-neutral-500">{txn.createdAt.toLocaleString()}</p>
                </div>
              </div>
              <span
                className={
                  txn.type === "WITHDRAWAL" || txn.type === "HOLD"
                    ? "shrink-0 font-semibold tabular-nums text-red-600"
                    : "shrink-0 font-semibold tabular-nums text-brand-green-700"
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
