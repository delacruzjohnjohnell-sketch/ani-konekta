import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions default to a 1MB request-body cap. Listing photos and
    // proof-of-delivery photos are submitted through Server Actions
    // (createListing, markDelivered) and are validated up to 8MB in
    // src/lib/blob-storage.ts (MAX_PHOTO_BYTES) — but that validation never
    // ran, because Next.js was rejecting the request body before it reached
    // our code for any real phone photo over ~1MB (raw 500: "Body exceeded
    // 1 MB limit"). Raised to 10mb — above the 8MB app-level max, with
    // headroom for multipart/form-data boundary and field overhead — so the
    // app's own validation (and its friendly error message) is what
    // actually runs for an oversized file, not the framework's silent cap.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
