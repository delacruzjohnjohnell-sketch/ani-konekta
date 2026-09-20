"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

const NUEVA_ECIJA_MUNICIPALITIES = [
  "Cabanatuan City",
  "Gapan City",
  "San Jose City",
  "Palayan City",
  "Muñoz",
  "Talavera",
  "Guimba",
  "Jaen",
  "Zaragoza",
];

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [role, setRole] = useState(searchParams.get("role") || "SELLER");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [municipality, setMunicipality] = useState(NUEVA_ECIJA_MUNICIPALITIES[0]);
  const [password, setPassword] = useState("");
  const [cooperativeName, setCooperativeName] = useState("");
  const [buyerType, setBuyerType] = useState<"RETAIL_SPOT" | "INSTITUTIONAL_ENTERPRISE">("RETAIL_SPOT");
  const [businessName, setBusinessName] = useState("");
  const [tin, setTin] = useState("");
  const [requiresBir2307, setRequiresBir2307] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        role,
        phone,
        email,
        municipality,
        password,
        ...(role === "COOPERATIVE_ADMIN" ? { cooperativeName } : {}),
        ...(role === "BUYER"
          ? {
              buyerType,
              ...(buyerType === "INSTITUTIONAL_ENTERPRISE"
                ? { registeredBusinessName: businessName, tin, requiresBir2307 }
                : {}),
            }
          : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? t("auth.register.error"));
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", {
      identifier: phone,
      password,
      redirect: false,
    });
    setLoading(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.register.title")}</CardTitle>
        <CardDescription>{t("auth.register.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="role">{t("auth.register.role")}</Label>
            <Select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="SELLER">{t("auth.register.role.seller")}</option>
              <option value="COOPERATIVE_ADMIN">Cooperative (bulk seller)</option>
              <option value="BUYER">{t("auth.register.role.buyer")}</option>
              <option value="HAULER">{t("auth.register.role.hauler")}</option>
            </Select>
          </div>
          {role === "COOPERATIVE_ADMIN" && (
            <div>
              <Label htmlFor="cooperativeName">Cooperative name</Label>
              <Input id="cooperativeName" value={cooperativeName} onChange={(e) => setCooperativeName(e.target.value)} required />
            </div>
          )}
          {role === "BUYER" && (
            <div className="space-y-3 rounded-lg border border-black/10 bg-neutral-50 p-3">
              <div>
                <Label htmlFor="buyerType">Buyer type</Label>
                <Select
                  id="buyerType"
                  value={buyerType}
                  onChange={(e) => setBuyerType(e.target.value as "RETAIL_SPOT" | "INSTITUTIONAL_ENTERPRISE")}
                >
                  <option value="RETAIL_SPOT">Retail / spot buyer</option>
                  <option value="INSTITUTIONAL_ENTERPRISE">Institutional enterprise</option>
                </Select>
              </div>
              {buyerType === "INSTITUTIONAL_ENTERPRISE" && (
                <>
                  <div>
                    <Label htmlFor="businessName">Registered business name</Label>
                    <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="tin">TIN</Label>
                    <Input id="tin" value={tin} onChange={(e) => setTin(e.target.value)} placeholder="123-456-789-000" autoComplete="off" required />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={requiresBir2307} onChange={(e) => setRequiresBir2307(e.target.checked)} className="h-4 w-4" />
                    We need BIR Form 2307 (creditable withholding) for our purchases
                  </label>
                  <p className="text-xs text-neutral-500">
                    Net-30 terms and credit limits are granted separately by an ANI-KONEKTA admin — never automatically.
                  </p>
                </>
              )}
            </div>
          )}
          <div>
            <Label htmlFor="name">{t("auth.register.name")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="phone">{t("auth.register.phone")}</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09171234567"
              required
            />
          </div>
          <div>
            <Label htmlFor="email">{t("auth.register.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="municipality">{t("auth.register.municipality")}</Label>
            <Select
              id="municipality"
              value={municipality}
              onChange={(e) => setMunicipality(e.target.value)}
            >
              {NUEVA_ECIJA_MUNICIPALITIES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="password">{t("auth.register.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && (
            <div role="alert" className="animate-pop-in rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-neutral-500">
          {t("auth.register.alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-brand-green-700">
            {t("auth.login.submit")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  const t = useT();
  return (
    <div className="harvest-hero flex min-h-[calc(100vh-4rem)] flex-col justify-center px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="ANI-KONEKTA" width={64} height={55} className="h-14 w-auto" priority />
          <p className="text-sm font-medium text-brand-green-800">{t("auth.register.joinNetwork")}</p>
        </div>
        <Suspense fallback={null}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
