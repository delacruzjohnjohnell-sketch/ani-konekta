import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderDetailView } from "@/components/order-detail-view";

export default async function BuyerOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      listing: true,
      buyer: true,
      seller: true,
      proofOfDelivery: true,
      route: { include: { orders: true, hauler: true } },
      ratings: true,
    },
  });

  if (!order || order.buyerId !== session!.user.id) notFound();

  return <OrderDetailView order={order} viewerRole="BUYER" viewerUserId={session!.user.id} />;
}
