import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

/**
 * Landing page after a cart checkout — a cart spanning multiple sellers
 * produces one Order per seller (Order.sellerId is single; see
 * checkoutCart in src/app/actions.ts), so redirecting to any one order
 * detail page wouldn't show the whole checkout. This page lists every
 * order the checkout just created and links into each's full detail page.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orders?: string }>;
}) {
  const { orders: ordersParam } = await searchParams;
  const locale = await getLocale();
  const orderIds = (ordersParam ?? "").split(",").filter(Boolean);

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    include: { listing: true, seller: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-green-100 text-3xl">
          ✅
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{t("cart.checkoutSuccess.title", locale)}</h1>
        <p className="text-neutral-600">{t("cart.checkoutSuccess.subtitle", locale)}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("buyer.myOrders", locale)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg border border-black/10 p-3">
              <div>
                <p className="font-medium text-neutral-900">
                  {o.listing.cropType} · {o.volumeKg} kg · {o.seller.name}
                </p>
                <p className="text-sm text-neutral-500">{formatPeso(o.totalAmount)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="gold">{t(`order.status.${o.status}`, locale)}</Badge>
                <Link href={`/buyer/order/${o.id}`}>
                  <Button variant="outline" size="sm">
                    {t("cart.checkoutSuccess.viewOrder", locale)}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="text-center">
        <Link href="/buyer/dashboard">
          <Button variant="ghost">{t("common.back", locale)}</Button>
        </Link>
      </div>
    </div>
  );
}
