import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Philippine TIN: 9 digits, optionally followed by a 3-digit branch code (dashes/spaces allowed).
const TIN_PATTERN = /^\d{3}[- ]?\d{3}[- ]?\d{3}([- ]?\d{3,5})?$/;

const registerSchema = z
  .object({
    name: z.string().min(2),
    role: z.enum(["SELLER", "COOPERATIVE_ADMIN", "BUYER", "HAULER"]),
    phone: z.string().min(7),
    email: z.string().email().optional().or(z.literal("")),
    municipality: z.string().optional(),
    password: z.string().min(6),
    // COOPERATIVE_ADMIN
    cooperativeName: z.string().trim().min(2).optional(),
    // BUYER
    buyerType: z.enum(["RETAIL_SPOT", "INSTITUTIONAL_ENTERPRISE"]).optional(),
    registeredBusinessName: z.string().trim().optional(),
    tin: z.string().trim().optional(),
    requiresBir2307: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "COOPERATIVE_ADMIN" && !v.cooperativeName) {
      ctx.addIssue({ code: "custom", message: "Cooperative name is required.", path: ["cooperativeName"] });
    }
    if (v.role === "BUYER" && v.buyerType === "INSTITUTIONAL_ENTERPRISE") {
      if (!v.registeredBusinessName) {
        ctx.addIssue({ code: "custom", message: "Registered business name is required for institutional buyers.", path: ["registeredBusinessName"] });
      }
      if (!v.tin || !TIN_PATTERN.test(v.tin)) {
        ctx.addIssue({ code: "custom", message: "A valid TIN (e.g. 123-456-789 or 123-456-789-000) is required for institutional buyers.", path: ["tin"] });
      }
    }
  });

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, role, phone, email, municipality, password, cooperativeName, buyerType, registeredBusinessName, tin, requiresBir2307 } =
    parsed.data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this phone or email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const institutional = role === "BUYER" && buyerType === "INSTITUTIONAL_ENTERPRISE";

  // Cooperative + its admin user are created together or not at all.
  // invoiceFinancingEligible / creditLimit are never set here — Admin only.
  const user = await prisma.$transaction(async (tx) => {
    const cooperative =
      role === "COOPERATIVE_ADMIN"
        ? await tx.cooperative.create({ data: { name: cooperativeName!, municipality: municipality || "Nueva Ecija" } })
        : null;
    return tx.user.create({
      data: {
        name,
        role,
        phone,
        email: email || undefined,
        municipality,
        passwordHash,
        cooperativeId: cooperative?.id,
        ...(role === "BUYER"
          ? {
              buyerType: buyerType ?? "RETAIL_SPOT",
              registeredBusinessName: institutional ? registeredBusinessName : null,
              tin: institutional ? tin : null,
              requiresBir2307: institutional ? Boolean(requiresBir2307) : false,
            }
          : {}),
      },
    });
  });

  // TIN and every other sensitive field stay out of the response.
  return NextResponse.json({ id: user.id, role: user.role });
}
