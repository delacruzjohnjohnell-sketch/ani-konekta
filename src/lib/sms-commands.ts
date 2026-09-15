import { prisma } from "@/lib/prisma";
import { suggestFairPrice } from "@/lib/pricing";
import { notifications } from "@/lib/notifications";
import { createEscrowedOrderForLines } from "@/lib/order-fulfillment";
import { StockUnavailableError } from "@/lib/listing-stock";

// Grammar for the no-smartphone SMS path (see plan Phase 10):
//   LIST <cropType> <volumeKg> <pricePerKg>   — seller creates a listing
//   ORDER <listingId> <qtyKg>                 — buyer places an escrowed order
// Anything else is reported back to the sender as "Unrecognized command."
// This is a real, functional command parser/dispatcher — not a UI mockup —
// it's only the telco gateway (an inbound SMS actually reaching this
// function) that stays simulated until a real provider is connected.

export type ParsedSmsCommand =
  | { type: "LIST"; cropType: string; volumeKg: number; pricePerKg: number }
  | { type: "ORDER"; listingId: string; qtyKg: number }
  | { type: "UNRECOGNIZED"; raw: string };

export function parseSmsCommand(body: string): ParsedSmsCommand {
  const parts = body.trim().split(/\s+/);
  const [command, ...args] = parts;

  if (command?.toUpperCase() === "LIST" && args.length === 3) {
    const [cropType, volumeKgRaw, pricePerKgRaw] = args;
    const volumeKg = Number(volumeKgRaw);
    const pricePerKg = Number(pricePerKgRaw);
    if (cropType && Number.isFinite(volumeKg) && volumeKg > 0 && Number.isFinite(pricePerKg) && pricePerKg > 0) {
      return { type: "LIST", cropType, volumeKg, pricePerKg };
    }
  }

  if (command?.toUpperCase() === "ORDER" && args.length === 2) {
    const [listingId, qtyKgRaw] = args;
    const qtyKg = Number(qtyKgRaw);
    if (listingId && Number.isFinite(qtyKg) && qtyKg > 0) {
      return { type: "ORDER", listingId, qtyKg };
    }
  }

  return { type: "UNRECOGNIZED", raw: body };
}

async function logSms(params: {
  direction: "IN" | "OUT";
  phone: string;
  body: string;
  userId?: string | null;
  parsedCommand?: string | null;
  parsedResult?: string | null;
}) {
  return prisma.smsMessage.create({
    data: {
      direction: params.direction,
      phone: params.phone,
      body: params.body,
      userId: params.userId ?? null,
      parsedCommand: params.parsedCommand ?? null,
      parsedResult: params.parsedResult ?? null,
    },
  });
}

/**
 * Handles one simulated inbound SMS end-to-end: logs it, resolves the
 * sender by phone, dispatches LIST/ORDER against the real database exactly
 * as the equivalent web forms would, logs + "sends" (mocked) an outbound
 * confirmation, and returns that confirmation so the /sms page can show it
 * immediately without a round trip through a real telco webhook.
 */
export async function handleInboundSms(params: { phone: string; body: string }): Promise<{
  success: boolean;
  reply: string;
}> {
  const { phone, body } = params;
  const user = await prisma.user.findUnique({ where: { phone } });
  const parsed = parseSmsCommand(body);

  let reply: string;
  let success = true;

  if (!user) {
    success = false;
    reply = `Phone ${phone} is not registered on ANI-KONEKTA. Please sign up first.`;
  } else if (parsed.type === "UNRECOGNIZED") {
    success = false;
    reply = `Unrecognized command. Try: LIST <crop> <kg> <price/kg> or ORDER <listingId> <kg>`;
  } else if (parsed.type === "LIST") {
    if (user.role !== "SELLER") {
      success = false;
      reply = "Only registered sellers can LIST produce.";
    } else {
      const aiSuggestedPricePerKg = await suggestFairPrice(
        parsed.cropType,
        user.municipality ?? "Unknown",
        "STANDARD"
      );
      const listing = await prisma.listing.create({
        data: {
          sellerId: user.id,
          cropType: parsed.cropType,
          volumeKg: parsed.volumeKg,
          harvestDate: new Date(),
          askingPricePerKg: parsed.pricePerKg,
          aiSuggestedPricePerKg,
          municipality: user.municipality ?? "Unknown",
          // No camera on a feature phone — this is the one documented,
          // intentional exception to the mandatory-photo listing rule.
          photoBlobKey: null,
        },
      });
      reply = `Listed ${parsed.volumeKg}kg of ${parsed.cropType} at PHP${parsed.pricePerKg}/kg. Listing ID: ${listing.id}`;
    }
  } else {
    // ORDER
    if (user.role !== "BUYER") {
      success = false;
      reply = "Only registered buyers can ORDER produce.";
    } else {
      const listing = await prisma.listing.findUnique({ where: { id: parsed.listingId } });
      if (!listing || listing.status !== "ACTIVE") {
        success = false;
        reply = `Listing ${parsed.listingId} is not available.`;
      } else if (parsed.qtyKg > listing.volumeKg) {
        success = false;
        reply = `Only ${listing.volumeKg}kg available for that listing.`;
      } else {
        try {
          const order = await createEscrowedOrderForLines({
            buyerId: user.id,
            sellerId: listing.sellerId,
            lines: [
              {
                listingId: listing.id,
                cropType: listing.cropType,
                qtyKg: parsed.qtyKg,
                pricePerKg: listing.askingPricePerKg,
              },
            ],
            isBulkMatch: false,
            decrementStock: true,
          });
          reply = `Order placed for ${parsed.qtyKg}kg of ${listing.cropType}. Order ID: ${order.id}. Payment held in escrow.`;
        } catch (err) {
          success = false;
          reply =
            err instanceof StockUnavailableError
              ? err.message
              : "Could not place order. Please try again.";
        }
      }
    }
  }

  await logSms({
    direction: "IN",
    phone,
    body,
    userId: user?.id,
    parsedCommand: parsed.type,
    parsedResult: success ? "OK" : "ERROR",
  });
  await logSms({ direction: "OUT", phone, body: reply, userId: user?.id });
  await notifications.sendSms({ to: phone, message: reply });

  return { success, reply };
}
