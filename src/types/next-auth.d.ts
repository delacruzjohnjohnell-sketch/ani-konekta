import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "SELLER" | "BUYER" | "HAULER" | "ADMIN";
    } & DefaultSession["user"];
  }
  interface User {
    role: "SELLER" | "BUYER" | "HAULER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "SELLER" | "BUYER" | "HAULER" | "ADMIN";
  }
}
