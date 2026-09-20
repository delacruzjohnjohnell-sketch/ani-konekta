import { prisma } from "@/lib/prisma";
import { resolvePhotoUrl } from "@/lib/blob-storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { signOffInspection } from "@/app/gate-pass/actions";

/**
 * Gate Passes the hauler has submitted that this seller/cooperative still has
 * to sign. Scoped server-side: pass exactly one of sellerId / cooperativeId.
 */
export async function PendingSignoffs({ sellerId, cooperativeId }: { sellerId?: string; cooperativeId?: string }) {
  const where = cooperativeId
    ? { ownerType: "COOPERATIVE" as const, cooperativeId }
    : { ownerType: "INDIVIDUAL_SELLER" as const, sellerId: sellerId ?? "__none__" };
  const orders = await prisma.order.findMany({
    where: { ...where, status: "POOLED", inspection: { is: { sellerSignedAt: null } } },
    include: { inspection: true, listing: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Card>
      <CardHeader><CardTitle>Gate Pass sign-off</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing waiting. The hauler records a Gate Pass at pickup, then you confirm it here.</p>
        ) : (
          orders.map((o) => {
            const i = o.inspection!;
            return (
              <div key={o.id} className="rounded-lg border border-black/10 p-3 text-sm">
                <p className="font-medium">{o.listing.cropType} · order …{o.id.slice(-6)}</p>
                <p>Hauler weighed <b>{i.actualPickupWeightKg} kg</b> (ordered {o.volumeKg} kg)</p>
                {i.moistureReadingPercent != null && <p>Moisture {i.moistureReadingPercent}%</p>}
                {i.packageCount != null && <p>{i.packageCount} packages · {i.qualityCondition}</p>}
                <div className="my-2 flex flex-wrap gap-2">
                  {i.originPhotoUrls.map((k) => {
                    const u = resolvePhotoUrl(k);
                    return u ? (
                      <a key={k} href={u} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="Gate Pass evidence" className="h-16 w-16 rounded-md border border-black/10 object-cover" />
                      </a>
                    ) : null;
                  })}
                </div>
                <ActionForm action={signOffInspection}>
                  <input type="hidden" name="orderId" value={o.id} />
                  <SubmitButton size="sm" label="Sign off & lock baseline" pendingLabel="Signing…" />
                </ActionForm>
                <p className="mt-1 text-xs text-neutral-500">Signing locks these figures as the origin baseline for any dockside dispute.</p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
