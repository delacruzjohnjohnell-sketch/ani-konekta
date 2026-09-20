import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { setBuyerCredit } from "@/app/admin/buyers/actions";

/** TIN is sensitive: the admin sees only the last 4 characters here. */
const maskTin = (tin: string | null) => (tin ? `••••${tin.replace(/\D/g, "").slice(-4)}` : "—");

export default async function AdminBuyersPage() {
  const buyers = await prisma.user.findMany({
    where: { role: "BUYER", buyerType: "INSTITUTIONAL_ENTERPRISE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, phone: true, registeredBusinessName: true, tin: true,
      requiresBir2307: true, invoiceFinancingEligible: true, creditLimit: true,
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Institutional buyers &amp; credit</h1>
          <p className="text-sm text-neutral-600">
            Net-30 / invoice-financing eligibility and credit limits are granted here manually — never automatically. Financing itself is
            not connected to a lender; eligibility only gates the Net-30 checkout option.
          </p>
        </div>
        <Link href="/admin"><Button variant="outline">← Admin</Button></Link>
      </div>

      {buyers.length === 0 && <p className="text-sm text-neutral-500">No institutional enterprise buyers registered.</p>}
      {buyers.map((b) => (
        <Card key={b.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span>{b.registeredBusinessName ?? b.name}</span>
              {b.requiresBir2307 && <Badge>Requires BIR 2307</Badge>}
              {b.invoiceFinancingEligible && <Badge>Net-30 eligible</Badge>}
            </CardTitle>
            <p className="text-xs text-neutral-500">Contact {b.name} · {b.phone} · TIN {maskTin(b.tin)}</p>
          </CardHeader>
          <CardContent>
            <ActionForm action={setBuyerCredit} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="buyerId" value={b.id} />
              <div className="flex items-center gap-2 pb-2">
                <input id={`e-${b.id}`} type="checkbox" name="invoiceFinancingEligible" defaultChecked={b.invoiceFinancingEligible} className="h-4 w-4" />
                <Label htmlFor={`e-${b.id}`}>Net-30 eligible</Label>
              </div>
              <div>
                <Label htmlFor={`c-${b.id}`}>Credit limit ₱</Label>
                <Input id={`c-${b.id}`} name="creditLimit" type="number" min="0" step="0.01" defaultValue={b.creditLimit ? b.creditLimit.toString() : ""} />
              </div>
              <SubmitButton size="sm" label="Save" pendingLabel="Saving…" />
            </ActionForm>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
