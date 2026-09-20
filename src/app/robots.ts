import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ani-konekta.vercel.app";

// Public pages are crawlable; authenticated portals, APIs and cron endpoints are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register"],
        disallow: [
          "/api/",
          "/admin",
          "/seller/",
          "/buyer/",
          "/hauler/",
          "/cooperative/",
          "/orders/",
          "/order/",
          "/messages",
          "/sms",
          "/dashboard",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
