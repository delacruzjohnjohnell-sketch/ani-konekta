import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

const ROLE_HOME: Record<string, string> = {
  SELLER: "/seller/dashboard",
  BUYER: "/buyer/dashboard",
  HAULER: "/hauler/dashboard",
  ADMIN: "/admin",
};

// Convenience redirector so login/register can send everyone to one place.
export default async function DashboardRedirect() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(ROLE_HOME[session.user.role] ?? "/");
}
