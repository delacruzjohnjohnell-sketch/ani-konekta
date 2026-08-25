# ROADMAP — Phase 2

Explicitly out of scope for the MVP (per build spec). Each item below notes
where the stub/interface already lives in the codebase so it's a swap-in,
not a rewrite.

- **Real SMS/voice hotline (Twilio)** — `src/lib/notifications.ts` already
  defines the interface (`sendSms`, `sendPush`,
  `notifyOrderStatusChange`); every call currently `console.log`s. Swap the
  body of `sendSms` for a real Twilio client call.
- **Real payment gateway (PayMongo / GCash)** — `src/lib/payments.ts`
  defines a `PaymentProvider` interface (`holdFunds`, `releaseFunds`,
  `refundFunds`) implemented by `MockPaymentProvider`. Add a
  `PayMongoProvider` implementing the same interface and swap the
  `paymentProvider` export.
- **Computer-vision quality grading** — would replace/augment the manual
  `qualityTag` field on `Listing` with an automated grade suggested from an
  uploaded photo.
- **IoT cold-chain sensors** — would feed live temperature/humidity data
  into `PooledRoute`/`ProofOfDelivery` for perishables.
- **Parametric weather micro-insurance** — a new model/flow tied to
  `Listing.harvestDate` and regional weather data.
- **Native mobile app** — the MVP is responsive web only.
- **Real route optimization** — `src/lib/routing.ts`'s municipality-level
  grouping heuristic would be replaced with a real routing API (e.g.
  Google Directions/OSRM) plus live hauler GPS.
- **Real AI pricing model** — `src/lib/pricing.ts`'s moving-average
  heuristic (documented in-file) would be replaced with a trained model
  using live transaction data, seasonality, and demand signals.
- **Vercel Blob wiring for photo uploads** — the MVP takes a plain photo
  URL string on listing creation; wire an actual `<input type="file">` +
  Blob upload once `BLOB_READ_WRITE_TOKEN` is set.
- **Multi-seller split bulk-match orders** — the MVP's bulk-match
  aggregates listings under one `Order.sellerId` (the first selected
  listing's seller) as a simplification; a real version would split payout
  across each contributing seller.
- **Farmer microloans using in-app order history as alt-credit data** —
  noted in the business plan's Financial Inclusion layer; would build on
  `ReputationEvent`/settled `Order` history.
