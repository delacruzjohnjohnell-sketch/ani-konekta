import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ani-konekta.vercel.app";

// Only public, logged-out pages. Portals sit behind login and are excluded in robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/register`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/login`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
