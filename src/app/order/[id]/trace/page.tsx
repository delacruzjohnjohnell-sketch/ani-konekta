import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolvePhotoUrl } from "@/lib/blob-storage";

// Public, QR-linked traceability page. No auth required — this is the page
// a printed/scanned QR code on a delivered order resolves to.
export default async function TracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { listing: true, seller: true, proofOfDelivery: true, route: true },
  });
  if (!order) notFound();

  const traceUrl = `https://ani-konekta.example/order/${order.id}/trace`;
  const qrDataUrl = await QRCode.toDataURL(traceUrl, { margin: 1, width: 220 });
  const listingPhotoUrl = resolvePhotoUrl(order.listing.photoBlobKey);
  const proofPhotoUrl = resolvePhotoUrl(order.proofOfDelivery?.photoBlobKey);

  return (
    <div className="harvest-hero min-h-screen">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="text-center">
        <Image
          src="/logo.png"
          alt="ANI-KONEKTA"
          width={48}
          height={41}
          className="mx-auto mb-3 h-10 w-auto"
        />
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-gold-600">
          Traceability record
        </p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900">
          {order.listing.cropType} — {order.volumeKg} kg
        </h1>
      </div>

      <Card className="overflow-hidden">
        <div className="h-1.5 harvest-band" />
        <CardContent className="flex flex-col items-center gap-4 pt-6">
          <div className="rounded-xl border-4 border-brand-gold-400 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR trace code" width={180} height={180} />
          </div>
          <p className="text-xs text-neutral-500">
            Trace code: <code>{order.proofOfDelivery?.qrTraceCode ?? "pending delivery"}</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Farm origin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-700">
          {listingPhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listingPhotoUrl}
              alt={`${order.listing.cropType} at harvest`}
              className="max-h-72 w-full rounded-lg object-cover"
            />
          )}
          <p>Grown by: {order.seller.name}</p>
          <p>Municipality: {order.listing.municipality}</p>
          <p>Harvest date: {order.listing.harvestDate.toLocaleDateString()}</p>
          <p>
            Quality: <Badge tone="gold">{order.listing.qualityTag}</Badge>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Handling chain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-700">
          {proofPhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proofPhotoUrl}
              alt="Proof of delivery"
              className="max-h-72 w-full rounded-lg object-cover"
            />
          )}
          <p>Order status: {order.status}</p>
          {order.route && (
            <>
              <p>Pooled route status: {order.route.status}</p>
              <p>
                Distance / ETA: {order.route.distanceKm} km / {order.route.etaMinutes} min
              </p>
            </>
          )}
          {order.proofOfDelivery && (
            <p>
              Delivered: {order.proofOfDelivery.deliveredAt.toLocaleString()}
              {order.proofOfDelivery.confirmedByBuyer ? " · confirmed by buyer" : ""}
            </p>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
