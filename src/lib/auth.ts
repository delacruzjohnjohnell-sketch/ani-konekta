import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        // Farmers may not have email — login by phone number reflects the
        // SMS-accessible persona from the business plan. Buyers/haulers can
        // use either phone or email in the same field.
        identifier: { label: "Phone or Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!identifier || !password) return null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [{ phone: identifier }, { email: identifier }],
          },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email ?? undefined,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; role: "SELLER" | "BUYER" | "HAULER" | "ADMIN" };
        token.role = u.role;
        token.id = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.id = token.id;
      }
      return session;
    },
  },
});
