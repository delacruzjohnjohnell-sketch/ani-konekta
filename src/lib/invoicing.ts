import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Invoice / BIR Form 2307 document workflow behind a provider abstraction.
 *
 * NO BIR-accredited e-invoicing (or 2307 filing) integration exists in this
 * project, so the only provider is SimulatedInvoicingProvider: its documents
 * are stored with provider="SIMULATED" and birCompliant=false and carry an
 * explicit "not an official BIR document" notice. A production provider only
 * needs to implement InvoicingProvider and be returned by getProvider().
 */
export interface InvoiceContext {
  orderId: string;
  seller: { type: "INDIVIDUAL_SELLER" | "COOPERATIVE"; name: string };
  buyer: { name: string; registeredBusinessName: string | null; tinMasked: string | null; requiresBir2307: boolean };
  amounts: {
    merchandisePHP: number;
    freightPHP: number;
    platformCommissionPHP: number;
    sellerNetPHP: number;
  };
}

export interface InvoicingProvider {
  name: string;
  birCompliant: boolean;
  issueTransactionInvoice(ctx: InvoiceContext): Promise<Prisma.InputJsonValue>;
  registerForm2307(ctx: InvoiceContext): Promise<Prisma.InputJsonValue>;
}

const SIMULATION_NOTICE =
  "SIMULATED DOCUMENT — not an official BIR-registered/accredited invoice or Form 2307 and not legally valid until issued through an accredited provider.";

const SimulatedInvoicingProvider: InvoicingProvider = {
  name: "SIMULATED",
  birCompliant: false,
  async issueTransactionInvoice(ctx) {
    return { notice: SIMULATION_NOTICE, ...ctx, issuedAt: new Date().toISOString() };
  },
  async registerForm2307(ctx) {
    return {
      notice: SIMULATION_NOTICE,
      withholdingAgent: ctx.buyer.registeredBusinessName ?? ctx.buyer.name,
      payorTin: ctx.buyer.tinMasked,
      payeeType: ctx.seller.type,
      payee: ctx.seller.name,
      incomeBasePHP: ctx.amounts.merchandisePHP,
      issuedAt: new Date().toISOString(),
    };
  },
};

function getProvider(): InvoicingProvider {
  return SimulatedInvoicingProvider; // swap for an accredited provider in production
}

const maskTin = (tin: string | null) => (tin ? `***-***-${tin.replace(/\D/g, "").slice(-3)}` : null);

/** Creates (idempotently, via @@unique[orderId,kind]) the invoice and, when required, the 2307 record. */
export async function createInvoiceDocuments(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { buyer: true, seller: true, cooperative: true },
  });
  const provider = getProvider();
  const ctx: InvoiceContext = {
    orderId,
    seller: {
      type: order.ownerType,
      name: order.ownerType === "COOPERATIVE" ? order.cooperative?.name ?? "Cooperative" : order.seller.name,
    },
    buyer: {
      name: order.buyer.name,
      registeredBusinessName: order.buyer.registeredBusinessName,
      // The raw TIN is never copied into documents — masked only.
      tinMasked: maskTin(order.buyer.tin),
      requiresBir2307: order.buyer.requiresBir2307,
    },
    amounts: {
      merchandisePHP: order.totalAmount,
      freightPHP: order.logisticsFeeAmountPHP ?? 0,
      platformCommissionPHP: order.sellerCommissionAmountPHP ?? 0,
      sellerNetPHP: order.netPayoutToSellerPHP ?? order.totalAmount,
    },
  };

  const docs: { kind: string; payload: Prisma.InputJsonValue }[] = [
    { kind: "TRANSACTION_INVOICE", payload: await provider.issueTransactionInvoice(ctx) },
  ];
  if (order.buyer.requiresBir2307) {
    docs.push({ kind: "FORM_2307", payload: await provider.registerForm2307(ctx) });
  }
  for (const d of docs) {
    const exists = await prisma.invoiceDocument.findUnique({
      where: { orderId_kind: { orderId, kind: d.kind } },
    });
    if (exists) continue;
    await prisma.invoiceDocument.create({
      data: { orderId, kind: d.kind, provider: provider.name, birCompliant: provider.birCompliant, payload: d.payload },
    });
  }
}
