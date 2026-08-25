# ANI-KONEKTA — "From Farm to Fair Trade."

A B2B agricultural marketplace and logistics-coordination MVP connecting Nueva
Ecija farmers/cooperatives directly to retailers, wholesalers, and
institutional buyers, with a pooled-logistics layer and an escrow-simulated
payment flow.

Explicit order pipeline:
`LISTED → MATCHED → ORDERED_ESCROWED → POOLED → IN_TRANSIT → DELIVERED → SETTLED`
(with a `DISPUTED` side-state).

## Tech stack

- **Framework**: Next.js 16 (App Router), TypeScript, React 19
- **Styling**: Tailwind CSS v4 + a small hand-built component kit
  (`src/components/ui`) in the same visual language shadcn/ui uses (Button,
  Card, Badge, Input, Select). We hand-rolled these instead of running the
  `shadcn` CLI so the project has zero external registry dependency at build
  time — same look, no network fetch required to scaffold components.
- **Database**: PostgreSQL via **Prisma** ORM (works with Vercel Postgres,
  Neon, or Supabase Postgres — any standard Postgres connection string)
- **Auth**: NextAuth.js v5, Credentials provider — log in with **phone
  number or email**, reflecting the SMS-accessible farmer persona from the
  business plan
- **File/image storage**: Vercel Blob is the intended target for produce
  photos/QR images in Phase 2; the MVP accepts a plain photo URL string
  instead (see `ROADMAP.md`) to avoid requiring Blob credentials to run
- **Notifications**: `src/lib/notifications.ts` — a clearly-marked stub
  interface; every call logs to the console instead of hitting Twilio
- **Payments/escrow**: `src/lib/payments.ts` — a clearly-marked
  `PaymentProvider` stub; escrow bookkeeping is real (tracked in
  `Order.escrowStatus` in the database), only the money movement is mocked
- **Routing/pooling**: `src/lib/routing.ts` — a municipality-level grouping
  heuristic standing in for real route optimization
- **Pricing**: `src/lib/pricing.ts` — a documented moving-average heuristic
  over seeded `PriceTrend` data, standing in for a future ML pricing model

## Project structure

```
src/
  app/
    page.tsx                     landing page
    login/, register/            auth
    dashboard/                   redirects to the right role dashboard
    seller/dashboard/            listings, orders, earnings, reputation
    buyer/dashboard/             browse/filter listings, bulk-match, orders, price trend
    buyer/order/[id]/            buyer-facing order detail (role-protected)
    orders/[id]/                 shared order detail for seller/hauler/admin
    hauler/dashboard/            accept & pool orders, advance route status
    admin/                       pipeline overview, disputes, escrow ledger
    order/[id]/trace/            PUBLIC QR-linked traceability page
    actions.ts                   all mutations, as Next.js Server Actions
    api/auth/[...nextauth]/      NextAuth route handler
    api/register/                account creation
  lib/                           prisma client, auth config, pricing/payments/
                                 notifications/routing stubs, utils
  components/                    Navbar, StatusTimeline, OrderDetailView, ui/*
  proxy.ts                       role-based route protection (Next.js 16
                                  renamed middleware.js -> proxy.js)
prisma/
  schema.prisma                  full data model
  seed.ts                        demo data seeder
```

## Local setup

1. **Install dependencies** (this also runs `prisma generate` via
   `postinstall`, which needs network access to fetch Prisma's engine
   binaries — see note below):
   ```bash
   npm install
   ```
2. **Set up Postgres.** Point `DATABASE_URL` in `.env` (copy from
   `.env.example`) at any Postgres instance — local, Vercel Postgres, Neon,
   or Supabase.
3. **Push the schema and seed demo data**:
   ```bash
   npm run db:push
   npm run db:seed
   ```
4. **Run the dev server**:
   ```bash
   npm run dev
   ```
   Visit http://localhost:3000.

### Demo account credentials (created by `npm run db:seed`)

Every seeded account uses the password **`password123`**.

| Role   | Phone         | Email                    |
|--------|---------------|--------------------------|
| Seller | 09171000001   | seller1@anikonekta.demo  |
| Buyer  | 09172000001   | buyer1@anikonekta.demo   |
| Hauler | 09173000001   | hauler1@anikonekta.demo  |
| Admin  | 09179000001   | admin@anikonekta.demo    |

Log in with either the phone number or the email.

### A note on this build's local verification

This project was built in a sandboxed cloud environment whose network
allowlist covers the npm registry but **not** `binaries.prisma.sh`, the CDN
Prisma's CLI uses to download its Rust query-engine binary. That means
`prisma generate` / `next build` could not be run end-to-end *inside that
sandbox*. This is a property of that one sandbox, not of the code — Vercel's
build environment (and any normal developer machine) has open internet
access and runs `prisma generate` automatically via the `postinstall`
script on every `npm install`.

What **was** verified in that sandbox instead:
- The entire Next.js app builds and passes ESLint with zero warnings.
- `next build`'s TypeScript pass succeeds except for errors that trace
  directly to the un-generated Prisma Client stub (which types
  `PrismaClient` as `any` until `generate` has run for real) — no other
  type errors were found.
- The Prisma schema was hand-translated to raw SQL and run against a real
  local Postgres instance, exercising the full `LISTED → SETTLED` happy
  path (listing → order → escrow hold → pooling → delivery → proof of
  delivery → buyer confirmation → escrow release → reputation update) plus
  the `User.phone` uniqueness constraint — all passed.

Once deployed (see below), run through the smoke-test checklist to confirm
the live app end-to-end.

## GitHub

```bash
git init            # already done if you received this as a working copy
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/ani-konekta.git
git push -u origin main
```

Replace `<your-username>` with your GitHub username or org.

## Deploying to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the
   `ani-konekta` GitHub repo. Vercel auto-detects Next.js — no build
   command changes needed.
2. **Add a Postgres database.** Easiest path: in the Vercel project →
   Storage tab → Create Database → Postgres (or connect Neon/Supabase).
   Vercel injects `DATABASE_URL` (and related `POSTGRES_*` vars)
   automatically when you use its own Postgres product.
3. **Set environment variables** in Project Settings → Environment
   Variables (see `.env.example` for the full list):
   - `DATABASE_URL` — set automatically if using Vercel Postgres; otherwise
     paste your Neon/Supabase connection string
   - `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL` — your production URL, e.g. `https://ani-konekta.vercel.app`
   - `BLOB_READ_WRITE_TOKEN` — only needed once you wire up real photo
     uploads (Phase 2); leave blank for the MVP
4. **Deploy.** Vercel runs `npm install` (which runs `prisma generate`),
   then `next build`.
5. **Run the schema push and seed once, against the production database**:
   ```bash
   # from your local machine, with DATABASE_URL pointed at the prod DB
   npx prisma db push
   npm run db:seed
   ```
6. Push to `main` from then on and Vercel redeploys automatically; pull
   requests get their own preview URLs.

## Smoke-test checklist (after deploying)

1. Log in as **Seller** (`09171000001` / `password123`) → confirm the demo
   listings and the one `SETTLED` demo order appear.
2. Log in as **Buyer** (`09172000001`) → browse listings, filter by crop or
   municipality, place an order on an `ACTIVE` listing → confirm it now
   shows `Ordered — Escrowed` and appears under "My orders."
3. Log in as **Hauler** (`09173000001`) → "Accept & pool" the new order →
   advance it Picked up → In transit → Delivered (add proof-of-delivery
   notes on the last step).
4. Back as **Buyer** → open the order → confirm delivery → verify status
   flips to `Settled` and escrow status to `RELEASED`.
5. Visit the order's public trace page (`/order/<id>/trace`, linked from
   the order detail page) → confirm the QR code renders and shows farm
   origin, harvest date, and handling chain.
6. Log in as **Admin** (`09179000001`) → confirm the pipeline counts,
   escrow ledger total, and the settled order all reflect the flow above.
