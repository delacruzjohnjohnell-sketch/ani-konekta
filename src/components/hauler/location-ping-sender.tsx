"use client";

import { useEffect, useState } from "react";

// FEATURE 3 — Live Hauler Location Tracking: sends this hauler's current
// position for one active route every ~20s (confirmed default — the
// prompt's suggested 15-30s range) while this component is mounted (i.e.
// while the hauler dashboard shows that route as PICKED_UP/IN_TRANSIT — the
// parent only renders this component for routes in that state). Uses the
// browser Geolocation watchPosition API; a throttled interval re-sends the
// latest known position rather than posting on every watchPosition callback
// (which can fire far more often than every 20s).
export function LocationPingSender({ routeId }: { routeId: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "denied" | "unsupported">("idle");

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    let latest: GeolocationPosition | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest = pos;
      },
      () => setStatus("denied"),
      { enableHighAccuracy: true, maximumAge: 15_000 }
    );

    async function sendPing() {
      if (!latest) return;
      setStatus("sending");
      try {
        await fetch(`/api/routes/${routeId}/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: latest.coords.latitude,
            lng: latest.coords.longitude,
            speedKph: latest.coords.speed != null ? latest.coords.speed * 3.6 : undefined,
          }),
        });
      } catch {
        // Best-effort — a dropped ping just means the buyer/seller sees a
        // slightly staler "last updated" time, handled by the map's own
        // stale-location threshold, not a user-facing error here.
      }
    }

    const intervalId = setInterval(sendPing, 20_000);
    // Also fire once shortly after mount, once a first fix is likely in.
    const initialTimeout = setTimeout(sendPing, 3_000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(intervalId);
      clearTimeout(initialTimeout);
    };
  }, [routeId]);

  if (status === "unsupported" || status === "denied") {
    return (
      <p className="text-xs text-neutral-400">
        📍 Location sharing {status === "denied" ? "was denied" : "isn't supported"} on this
        device — buyers/sellers won&apos;t see a live map for this route.
      </p>
    );
  }

  return <p className="text-xs text-neutral-400">📍 Sharing live location for this route.</p>;
}
