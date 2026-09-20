import { prisma } from "@/lib/prisma";
import { coordinatesForMunicipality, haversineDistanceKm } from "@/lib/municipality-coordinates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatPeso } from "@/lib/utils";
import { declareReturnAvailability, deactivateAvailability } from "@/app/hauler/actions";

/**
 * Backhaul Finder: real BackhaulCargo records (admin-entered) ranked by the
 * straight-line distance from the hauler's drop-off to the cargo pickup.
 * Rates are shown only if the shipper quoted one — otherwise "not quoted".
 * No availability or earnings are ever estimated.
 */
export async function BackhaulFinder({ haulerId, dropoffMunicipalities }: { haulerId: string; dropoffMunicipalities: string[] }) {
  const [cargo, mine] = await Promise.all([
    prisma.backhaulCargo.findMany({ where: { active: true }, orderBy: { availableFrom: "asc" }, take: 30 }),
    prisma.haulerAvailability.findMany({ where: { haulerId, active: true }, orderBy: { availableFrom: "asc" } }),
  ]);

  const anchor = dropoffMunicipalities[0] ?? null;
  const ranked = cargo
    .map((c) => ({
      c,
      deviationKm: anchor
        ? Math.round(haversineDistanceKm(coordinatesForMunicipality(anchor), coordinatesForMunicipality(c.pickupMunicipality)))
        : null,
    }))
    .sort((a, b) => (a.deviationKm ?? 9999) - (b.deviationKm ?? 9999));

  return (
    <Card>
      <CardHeader><CardTitle>Backhaul finder</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {ranked.length === 0 ? (
          <p className="text-sm text-neutral-500">No return loads are listed right now. Declare your availability below and dispatch can match you.</p>
        ) : (
          <ul className="space-y-2">
            {ranked.map(({ c, deviationKm }) => (
              <li key={c.id} className="rounded-lg border border-black/10 p-3 text-sm">
                <p className="font-medium">{c.pickupMunicipality} → {c.destinationMunicipality} · {c.cargoType} · {c.weightKg} kg</p>
                <p className="text-xs text-neutral-500">
                  Ready {c.availableFrom.toLocaleString()} ·{" "}
                  {deviationKm != null ? `~${deviationKm} km from your drop-off in ${anchor} (straight-line estimate)` : "route deviation shown once you have an active trip"} ·{" "}
                  Rate: <b>{c.offeredPricePHP != null ? formatPeso(c.offeredPricePHP) : "not quoted"}</b>
                </p>
                {c.notes && <p className="text-xs text-neutral-500">{c.notes}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-black/10 pt-3">
          <p className="mb-2 text-sm font-medium">Declare return availability</p>
          <ActionForm action={declareReturnAvailability} className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ra-o">From</Label><Input id="ra-o" name="originMunicipality" defaultValue={anchor ?? ""} required /></div>
            <div><Label htmlFor="ra-d">To</Label><Input id="ra-d" name="destinationMunicipality" required /></div>
            <div><Label htmlFor="ra-c">Spare capacity (kg)</Label><Input id="ra-c" name="capacityKg" type="number" min="1" step="1" required /></div>
            <div><Label htmlFor="ra-a">Available from</Label><Input id="ra-a" name="availableFrom" type="datetime-local" required /></div>
            <div className="col-span-2"><SubmitButton size="sm" label="Declare availability" pendingLabel="Saving…" /></div>
          </ActionForm>
          {mine.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {mine.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span>{a.originMunicipality} → {a.destinationMunicipality} · {a.capacityKg} kg · {a.availableFrom.toLocaleString()}</span>
                  <ActionForm action={deactivateAvailability}>
                    <input type="hidden" name="availabilityId" value={a.id} />
                    <SubmitButton size="sm" variant="ghost" label="Remove" pendingLabel="…" />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
