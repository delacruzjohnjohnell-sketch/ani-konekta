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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, phone, email, municipality, password }),
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
              <option value="BUYER">{t("auth.register.role.buyer")}</option>
              <option value="HAULER">{t("auth.register.role.hauler")}</option>
            </Select>
          </div>
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
          {error && <p className="text-sm text-red-600">{error}</p>}
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
