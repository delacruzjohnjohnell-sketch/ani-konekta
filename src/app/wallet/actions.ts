"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/actions";
import { topUpWallet, withdrawFromWallet, InsufficientWalletBalanceError } from "@/lib/wallet";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import type { ActionState } from "@/components/ui/action-form";

export async function topUpWalletAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = await getLocale();
  const user = await requireUser("BUYER");
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: t("wallet.error.invalidAmount", locale) };
  }

  await topUpWallet(user.id, amount, "Buyer top-up (simulated — no payment gateway connected yet)");
  revalidatePath("/buyer/wallet");
  return { success: true };
}

export async function withdrawFromWalletAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = await getLocale();
  const user = await requireUser("BUYER");
  const amount = Number(formData.get("amount"));

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: t("wallet.error.invalidAmount", locale) };
  }

  try {
    await withdrawFromWallet(user.id, amount, "Buyer withdrawal (simulated — no payment gateway connected yet)");
  } catch (err) {
    if (err instanceof InsufficientWalletBalanceError) {
      return { error: t("wallet.error.insufficientFunds", locale) };
    }
    throw err;
  }
  revalidatePath("/buyer/wallet");
  return { success: true };
}
