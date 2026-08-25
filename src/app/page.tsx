import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  { title: "List", body: "Farmers and co-ops post crop, volume, harvest date, and price." },
  { title: "Match", body: "Buyers browse or get matched; bulk-match aggregates smallholders into one order." },
  { title: "Move", body: "Pooled logistics batches nearby orders into shared truck trips via verified haulers." },
  { title: "Settle", body: "Escrow-held payment releases to the seller only once delivery is confirmed." },
];

export default function Home() {
  return (
    <div>
      <section className="bg-gradient-to-b from-[#1E7A3D]/10 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#C98A1A]">
            Agriculture / AgriTech · Nueva Ecija
          </p>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            ANI-KONEKTA
          </h1>
          <p className="mt-2 max-w-xl text-lg text-neutral-600">
            &ldquo;From Farm to Fair Trade.&rdquo; A B2B marketplace and pooled-logistics
            platform connecting Nueva Ecija farmers and cooperatives directly to
            retailers, wholesalers, and institutional buyers — with escrow-protected
            payment so no one delivers produce on a promise.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register?role=SELLER">
              <Button size="lg">I&apos;m a Farmer / Seller</Button>
            </Link>
            <Link href="/register?role=BUYER">
              <Button size="lg" variant="secondary">
                I&apos;m a Buyer
              </Button>
            </Link>
            <Link href="/register?role=HAULER">
              <Button size="lg" variant="outline">
                I&apos;m a Hauler
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-xl font-semibold text-neutral-900">How it works</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Card key={s.title}>
              <CardContent className="pt-5">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#1E7A3D] text-sm font-bold text-white">
                  {i + 1}
                </div>
                <h3 className="font-semibold text-neutral-900">{s.title}</h3>
                <p className="mt-1 text-sm text-neutral-600">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <Card className="bg-[#1E7A3D] text-white">
          <CardContent className="flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold">See the full trade pipeline in action</h2>
              <p className="mt-1 text-white/80">
                Log in with a demo account to explore the seller, buyer, hauler, and
                admin views — see README.md for demo credentials.
              </p>
            </div>
            <Link href="/login">
              <Button variant="secondary" size="lg">
                Log in to demo
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
