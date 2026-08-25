import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const registerSchema = z.object({
  name: z.string().min(2),
  role: z.enum(["SELLER", "BUYER", "HAULER"]),
  phone: z.string().min(7),
  email: z.string().email().optional().or(z.literal("")),
  municipality: z.string().optional(),
  password: z.string().min(6),
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
  const { name, role, phone, email, municipality, password } = parsed.data;

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

  const user = await prisma.user.create({
    data: {
      name,
      role,
      phone,
      email: email || undefined,
      municipality,
      passwordHash,
    },
  });

  return NextResponse.json({ id: user.id, role: user.role });
}
