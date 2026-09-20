import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { CommodityFields } from "@/components/listing/commodity-fields";
import { createOfflineListing } from "@/app/admin/offline-desk/actions";

export default async function OfflineDeskPage() {
  const recent = await prisma.listing.findMany({
    where: { assistedEntrySource: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { seller: { select: { name: true, phone: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Offline listing desk</h1>
          <p className="text-sm text-neutral-600">
            Key in a listing for a farmer who phoned or walked in. The farmer stays the owner and gets paid; your account and the
            entry source are recorded on the listing and in the audit log.
          </p>
        </div>
        <Link href="/admin"><Button variant="outline">← Admin</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle>New assisted listing</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={createOfflineListing} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label htmlFor="od-phone">Farmer phone (registered seller)</Label><Input id="od-phone" name="farmerPhone" placeholder="09XXXXXXXXX" required /></div>
              <div>
                <Label htmlFor="od-src">Received via</Label>
                <Select id="od-src" name="assistedEntrySource" defaultValue="" required>
                  <option value="" disabled>Select…</option>
                  <option value="PHONE_CALL">Phone call</option>
                  <option value="WALK_IN">Walk-in</option>
                  <option value="FIELD_AGENT">Field agent</option>
                  <option value="SMS">SMS relay</option>
                </Select>
              </div>
              <div><Label htmlFor="od-crop">Crop</Label><Input id="od-crop" name="cropType" placeholder="Palay (Rice)" required /></div>
              <div><Label htmlFor="od-var">Variety</Label><Input id="od-var" name="variety" /></div>
              <div><Label htmlFor="od-vol">Volume (kg)</Label><Input id="od-vol" name="volumeKg" type="number" min="1" step="1" required /></div>
              <div><Label htmlFor="od-price">Asking ₱/kg</Label><Input id="od-price" name="askingPricePerKg" type="number" min="0" step="0.01" required /></div>
              <div><Label htmlFor="od-h">Harvest date</Label><Input id="od-h" name="harvestDate" type="date" required /></div>
              <div><Label htmlFor="od-m">Municipality (blank = farmer’s)</Label><Input id="od-m" name="municipality" /></div>
              <div>
                <Label htmlFor="od-q">Quality tag</Label>
                <Select id="od-q" name="qualityTag" defaultValue="STANDARD">
                  <option value="STANDARD">Standard</option>
                  <option value="GRADE_A">Grade A</option>
                  <option value="ORGANIC">Organic</option>
                  <option value="GAP_CERTIFIED">GAP certified</option>
                </Select>
              </div>
              <div><Label htmlFor="od-photo">Photo (optional)</Label><Input id="od-photo" name="photo" type="file" accept="image/*" /></div>
            </div>
            <CommodityFields idPrefix="od" />
            <div><Label htmlFor="od-desc">Description</Label><Textarea id="od-desc" name="description" rows={2} /></div>
            <SubmitButton label="Create listing for farmer" pendingLabel="Creating…" />
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent assisted entries</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-neutral-500">None yet.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm">
              {recent.map((l) => (
                <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{l.cropType} · {l.volumeKg} kg · owner {l.seller?.name ?? "—"}</span>
                  <span className="text-neutral-500">{l.assistedEntrySource} · {l.createdAt.toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
