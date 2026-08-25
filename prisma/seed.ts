/**
 * Seed script — realistic demo data so a freshly-deployed instance is
 * immediately explorable: 3 demo users per role, sample rice/vegetable
 * listings across Nueva Ecija municipalities, mock price history, and one
 * fully-settled order plus one in-progress order to show the pipeline.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [seller1, seller2, seller3] = await Promise.all([
    upsertUser({
      name: "Mang Ernesto Santos",
      role: "SELLER",
      phone: "09171000001",
      email: "seller1@anikonekta.demo",
      municipality: "Talavera",
      passwordHash,
    }),
    upsertUser({
      name: "Nueva Ecija Rice Farmers Coop",
      role: "SELLER",
      phone: "09171000002",
      email: "seller2@anikonekta.demo",
      municipality: "Guimba",
      passwordHash,
    }),
    upsertUser({
      name: "Aling Rosa Cruz",
      role: "SELLER",
      phone: "09171000003",
      email: "seller3@anikonekta.demo",
      municipality: "Jaen",
      passwordHash,
    }),
  ]);

  const [buyer1, buyer2] = await Promise.all([
    upsertUser({
      name: "Cabanatuan Wet Market Traders",
      role: "BUYER",
      phone: "09172000001",
      email: "buyer1@anikonekta.demo",
      municipality: "Cabanatuan City",
      passwordHash,
    }),
    upsertUser({
      name: "Metro Manila Institutional Foods Inc.",
      role: "BUYER",
      phone: "09172000002",
      email: "buyer2@anikonekta.demo",
      municipality: "Cabanatuan City",
      passwordHash,
    }),
    upsertUser({
      name: "San Jose Grains Wholesaler",
      role: "BUYER",
      phone: "09172000003",
      email: "buyer3@anikonekta.demo",
      municipality: "San Jose City",
      passwordHash,
    }),
  ]);

  const [hauler1] = await Promise.all([
    upsertUser({
      name: "Kuya Dante Trucking",
      role: "HAULER",
      phone: "09173000001",
      email: "hauler1@anikonekta.demo",
      municipality: "Cabanatuan City",
      passwordHash,
    }),
    upsertUser({
      name: "Nueva Ecija Freight Partners",
      role: "HAULER",
      phone: "09173000002",
      email: "hauler2@anikonekta.demo",
      municipality: "Gapan City",
      passwordHash,
    }),
    upsertUser({
      name: "Palayan Logistics Co.",
      role: "HAULER",
      phone: "09173000003",
      email: "hauler3@anikonekta.demo",
      municipality: "Palayan City",
      passwordHash,
    }),
  ]);

  await upsertUser({
    name: "ANI-KONEKTA Admin",
    role: "ADMIN",
    phone: "09179000001",
    email: "admin@anikonekta.demo",
    municipality: "Cabanatuan City",
    passwordHash,
  });

  // Commission & fee engine rules (idempotent — re-running seed won't
  // duplicate these). See src/lib/commission.ts for how rules are selected.
  const existingDefaultRule = await prisma.commissionConfig.findFirst({
    where: { cropType: null, minOrderVolumeKg: null, effectiveTo: null },
  });
  if (!existingDefaultRule) {
    await prisma.commissionConfig.create({
      data: {
        cropType: null,
        minOrderVolumeKg: null,
        sellerCommissionRatePercent: 6.0,
        buyerLogisticsFeePercent: 2.0,
        haulerPayoutPercentOfLogisticsFee: 75.0,
        minFeeFloorPHP: 20.0,
      },
    });
  }
  const existingBulkRule = await prisma.commissionConfig.findFirst({
    where: { cropType: null, minOrderVolumeKg: 1000, effectiveTo: null },
  });
  if (!existingBulkRule) {
    await prisma.commissionConfig.create({
      data: {
        cropType: null,
        minOrderVolumeKg: 1000,
        sellerCommissionRatePercent: 4.5,
        buyerLogisticsFeePercent: 2.0,
        haulerPayoutPercentOfLogisticsFee: 75.0,
        minFeeFloorPHP: 20.0,
      },
    });
  }

  // Mock price history (moving-average source for src/lib/pricing.ts)
  const priceHistory = [
    { cropType: "Palay (Rice)", municipality: "Talavera", base: 22 },
    { cropType: "Palay (Rice)", municipality: "Guimba", base: 21.5 },
    { cropType: "Palay (Rice)", municipality: "Jaen", base: 22.5 },
    { cropType: "Onion", municipality: "San Jose City", base: 85 },
    { cropType: "Tomato", municipality: "Cabanatuan City", base: 35 },
  ];
  for (const p of priceHistory) {
    for (let i = 0; i < 6; i++) {
      const recordedAt = new Date();
      recordedAt.setMonth(recordedAt.getMonth() - i);
      await prisma.priceTrend.create({
        data: {
          cropType: p.cropType,
          municipality: p.municipality,
          avgPricePerKg: p.base + (Math.sin(i) * 1.5 + i * 0.2),
          recordedAt,
        },
      });
    }
  }

  // Listings
  const listingActive = await prisma.listing.create({
    data: {
      sellerId: seller1.id,
      cropType: "Palay (Rice)",
      variety: "RC-160",
      volumeKg: 2000,
      harvestDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      askingPricePerKg: 23,
      aiSuggestedPricePerKg: 22.4,
      qualityTag: "GRADE_A",
      municipality: "Talavera",
      status: "ACTIVE",
    },
  });

  await prisma.listing.create({
    data: {
      sellerId: seller2.id,
      cropType: "Palay (Rice)",
      variety: "NSIC Rc 216",
      volumeKg: 3500,
      harvestDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      askingPricePerKg: 21.8,
      aiSuggestedPricePerKg: 21.9,
      qualityTag: "GAP_CERTIFIED",
      municipality: "Guimba",
      status: "ACTIVE",
    },
  });

  await prisma.listing.create({
    data: {
      sellerId: seller3.id,
      cropType: "Onion",
      volumeKg: 800,
      harvestDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      askingPricePerKg: 88,
      aiSuggestedPricePerKg: 90.1,
      qualityTag: "ORGANIC",
      municipality: "Jaen",
      status: "ACTIVE",
    },
  });

  // A fully SETTLED demo order (shows off the complete pipeline + trace page)
  const settledListing = await prisma.listing.create({
    data: {
      sellerId: seller1.id,
      cropType: "Palay (Rice)",
      variety: "RC-160",
      volumeKg: 1200,
      harvestDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      askingPricePerKg: 22.5,
      aiSuggestedPricePerKg: 22.1,
      qualityTag: "GRADE_A",
      municipality: "Talavera",
      status: "CLOSED",
    },
  });
  const settledRoute = await prisma.pooledRoute.create({
    data: {
      haulerId: hauler1.id,
      pickupPoints: ["Talavera"],
      dropoffPoint: "Cabanatuan Wet Market Traders warehouse",
      status: "DELIVERED",
      etaMinutes: 45,
      distanceKm: 12,
    },
  });
  const settledOrder = await prisma.order.create({
    data: {
      listingId: settledListing.id,
      buyerId: buyer1.id,
      sellerId: seller1.id,
      volumeKg: 1200,
      agreedPricePerKg: 22.5,
      totalAmount: 27000,
      status: "SETTLED",
      escrowStatus: "RELEASED",
      routeId: settledRoute.id,
    },
  });
  await prisma.proofOfDelivery.create({
    data: {
      orderId: settledOrder.id,
      confirmedByBuyer: true,
      notes: "Received in good condition, 1200kg confirmed.",
    },
  });
  await prisma.reputationEvent.createMany({
    data: [
      { userId: seller1.id, orderId: settledOrder.id, type: "ON_TIME", delta: 5 },
      { userId: buyer1.id, orderId: settledOrder.id, type: "ON_TIME", delta: 2 },
    ],
  });
  await prisma.user.update({ where: { id: seller1.id }, data: { reputationScore: { increment: 5 } } });
  await prisma.user.update({ where: { id: buyer1.id }, data: { reputationScore: { increment: 2 } } });

  // An in-progress demo order (escrowed, awaiting hauler pickup)
  const inProgressListing = await prisma.listing.create({
    data: {
      sellerId: seller2.id,
      cropType: "Palay (Rice)",
      variety: "NSIC Rc 216",
      volumeKg: 1500,
      harvestDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      askingPricePerKg: 21.5,
      aiSuggestedPricePerKg: 21.7,
      qualityTag: "STANDARD",
      municipality: "Guimba",
      status: "CLOSED",
    },
  });
  await prisma.order.create({
    data: {
      listingId: inProgressListing.id,
      buyerId: buyer2.id,
      sellerId: seller2.id,
      volumeKg: 1500,
      agreedPricePerKg: 21.5,
      totalAmount: 32250,
      status: "ORDERED_ESCROWED",
      escrowStatus: "HELD",
    },
  });

  console.log("Seed complete.");
  console.log(`Demo password for every seeded account: ${DEMO_PASSWORD}`);
  console.log("Seller: 09171000001 | Buyer: 09172000001 | Hauler: 09173000001 | Admin: 09179000001");
  console.log(`Listing awaiting pooling from seed: ${listingActive.id}`);
}

async function upsertUser(data: {
  name: string;
  role: "SELLER" | "BUYER" | "HAULER" | "ADMIN";
  phone: string;
  email: string;
  municipality: string;
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { phone: data.phone },
    update: {},
    create: data,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
