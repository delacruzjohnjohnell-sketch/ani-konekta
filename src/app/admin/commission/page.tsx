import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPeso } from "@/lib/utils";
import { createCommissionConfig, endDateCommissionConfig } from "@/app/actions";

export default async function CommissionConfigPage() {
  const configs = await prisma.commissionConfig.findMany({
    orderBy: [{ effectiveFrom: "desc" }],
  });

  const now = new Date();
  const active = configs.filter((c) => c.effectiveFrom <= now && (!c.effectiveTo || c.effectiveTo > now));
  const historical = configs.filter((c) => !active.includes(c));

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Commission &amp; fee rules</h1>
        <p className="text-neutral-600">
          Rules are never edited in place — end-date a rule and create a replacement. Orders
          already placed keep whatever rate was active when they were created.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Add a new rule</CardTitle>
            <CardDescription>
              Leave crop type / min volume blank to apply broadly. The most specific matching
              rule wins (crop + volume &gt; crop only &gt; volume only &gt; default).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCommissionConfig} className="space-y-4">
              <div>
                <Label htmlFor="cropType">Crop type (optional)</Label>
                <Input id="cropType" name="cropType" placeholder="Palay (Rice)" />
              </div>
              <div>
                <Label htmlFor="minOrderVolumeKg">Min order volume, kg (optional)</Label>
                <Input id="minOrderVolumeKg" name="minOrderVolumeKg" type="number" min="0" step="1" />
              </div>
              <div>
                <Label htmlFor="sellerCommissionRatePercent">Seller commission (%)</Label>
                <Input
                  id="sellerCommissionRatePercent"
                  name="sellerCommissionRatePercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue="6.00"
                  required
                />
              </div>
              <div>
                <Label htmlFor="buyerLogisticsFeePercent">Buyer logistics fee (%)</Label>
                <Input
                  id="buyerLogisticsFeePercent"
                  name="buyerLogisticsFeePercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue="2.00"
                  required
                />
              </div>
              <div>
                <Label htmlFor="haulerPayoutPercentOfLogisticsFee">
                  Hauler payout (% of logistics fee)
                </Label>
                <Input
                  id="haulerPayoutPercentOfLogisticsFee"
                  name="haulerPayoutPercentOfLogisticsFee"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue="75.00"
                  required
                />
              </div>
              <div>
                <Label htmlFor="minFeeFloorPHP">Minimum platform fee floor (₱)</Label>
                <Input
                  id="minFeeFloorPHP"
                  name="minFeeFloorPHP"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="20.00"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Create rule
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Active rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {active.length === 0 && (
                <p className="text-sm text-neutral-500">No active rules — orders will fail to price.</p>
              )}
              {active.map((c) => (
                <RuleRow key={c.id} config={c} active />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historical rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {historical.length === 0 && (
                <p className="text-sm text-neutral-500">No end-dated rules yet.</p>
              )}
              {historical.map((c) => (
                <RuleRow key={c.id} config={c} active={false} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

type ConfigRow = {
  id: string;
  cropType: string | null;
  minOrderVolumeKg: number | null;
  sellerCommissionRatePercent: number;
  buyerLogisticsFeePercent: number;
  haulerPayoutPercentOfLogisticsFee: number;
  minFeeFloorPHP: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

function RuleRow({ config: c, active }: { config: ConfigRow; active: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3">
      <div>
        <p className="font-medium text-neutral-900">
          {c.cropType ?? "Any crop"} · {c.minOrderVolumeKg ? `≥ ${c.minOrderVolumeKg} kg` : "Any volume"}
        </p>
        <p className="text-sm text-neutral-500">
          Seller {c.sellerCommissionRatePercent}% · Logistics {c.buyerLogisticsFeePercent}% · Hauler{" "}
          {c.haulerPayoutPercentOfLogisticsFee}% of that · floor {formatPeso(c.minFeeFloorPHP)}
        </p>
        <p className="text-xs text-neutral-400">
          Effective {c.effectiveFrom.toLocaleDateString()}
          {c.effectiveTo ? ` – ${c.effectiveTo.toLocaleDateString()}` : " – present"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={active ? "green" : "gray"}>{active ? "Active" : "Ended"}</Badge>
        {active && (
          <form action={endDateCommissionConfig}>
            <input type="hidden" name="configId" value={c.id} />
            <Button type="submit" variant="outline" size="sm">
              End-date
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
