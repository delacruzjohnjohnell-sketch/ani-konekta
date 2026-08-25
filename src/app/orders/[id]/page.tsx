import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderDetailView } from "@/components/order-detail-view";

// Shared, non-role-prefixed order detail view for sellers, haulers, and
// admins (buyers use /buyer/order/[id], which is role-protected by proxy.ts).
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/orders/${id}`);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { listing: true, buyer: true, seller: true, proofOfDelivery: true, route: true },
  });
  if (!order) notFound();

  const { role, id: userId } = session.user;
  const allowed =
    role === "ADMIN" ||
    (role === "SELLER" && order.sellerId === userId) ||
    (role === "BUYER" && order.buyerId === userId) ||
    (role === "HAULER" && order.route?.haulerId === userId);

  if (!allowed) notFound();

  return <OrderDetailView order={order} viewerRole={role} />;
}
