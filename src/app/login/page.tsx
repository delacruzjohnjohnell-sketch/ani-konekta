"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const t = useT();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(t("auth.login.error"));
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.login.title")}</CardTitle>
        <CardDescription>{t("auth.login.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="identifier">{t("auth.login.identifier")}</Label>
            <Input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="09171234567 or you@example.com"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">{t("auth.login.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-neutral-500">
          {t("auth.login.noAccount")}{" "}
          <Link href="/register" className="font-medium text-brand-green-700">
            {t("auth.login.signUp")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  const t = useT();
  return (
    <div className="harvest-hero flex min-h-[calc(100vh-4rem)] flex-col justify-center px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="ANI-KONEKTA" width={64} height={55} className="h-14 w-auto" priority />
          <p className="text-sm font-medium text-brand-green-800">{t("auth.welcomeBack")}</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
