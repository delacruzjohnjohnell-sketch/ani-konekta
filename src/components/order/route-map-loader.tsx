"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`/`document` at module scope, so it can never run
// during SSR — ssr:false must live inside a Client Component file (Next.js
// forbids it directly in a Server Component), hence this thin wrapper
// around order-detail-view.tsx (a Server Component) rendering the real map.
const RouteMap = dynamic(() => import("@/components/order/route-map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 w-full items-center justify-center rounded-lg border border-black/10 bg-neutral-50 text-sm text-neutral-400">
      Loading map…
    </div>
  ),
});

export function RouteMapLoader(props: {
  routeId: string;
  pickupPoints: string[];
  dropoffPoint: string;
}) {
  return <RouteMap {...props} />;
}
