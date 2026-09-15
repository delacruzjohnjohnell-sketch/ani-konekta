"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  coordinatesForMunicipality,
  haversineDistanceKm,
  estimateEtaMinutes,
} from "@/lib/municipality-coordinates";

// FEATURE 3 — Live Hauler Location Tracking + ETA. Leaflet + OpenStreetMap
// tiles (confirmed default — free, no API key, and none is configured in
// this project). Polls GET /api/routes/[id]/location every 20s (confirmed
// default) rather than opening a websocket/SSE channel — no real-time infra
// exists elsewhere in this app to reuse, and polling is plenty for a
// once-per-20s update rate.
//
// "Stale location" threshold: 10 minutes (confirmed default) — past that,
// show "Location unavailable" instead of a stale, confidently-wrong ETA.
const POLL_INTERVAL_MS = 20_000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

type LocationResponse =
  | { available: true; lat: number; lng: number; lastPingAt: string }
  | { available: false; reason: "settled" | "no_pings_yet" };

export function RouteMap({
  routeId,
  pickupPoints,
  dropoffPoint,
}: {
  routeId: string;
  pickupPoints: string[];
  dropoffPoint: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const haulerMarkerRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);

  const [location, setLocation] = useState<LocationResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const dropoff = coordinatesForMunicipality(dropoffPoint);
  const pickups = pickupPoints.map((p) => coordinatesForMunicipality(p));

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([dropoff.lat, dropoff.lng], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    for (const p of pickups) {
      L.marker([p.lat, p.lng], { title: "Pickup" })
        .addTo(map)
        .bindPopup("Pickup");
    }
    L.marker([dropoff.lat, dropoff.lng], { title: "Drop-off" })
      .addTo(map)
      .bindPopup("Drop-off");

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll location.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/routes/${routeId}/location`);
        if (!res.ok) return;
        const data: LocationResponse = await res.json();
        if (!cancelled) setLocation(data);
      } catch {
        // Transient network failure — next poll will retry; the stale-time
        // check below handles a prolonged outage.
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [routeId]);

  // "Xs/min ago" ticker + ETA recompute cadence.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Update hauler marker + line when location changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location?.available) return;

    const pos: [number, number] = [location.lat, location.lng];
    if (!haulerMarkerRef.current) {
      haulerMarkerRef.current = L.marker(pos, {
        icon: L.divIcon({
          className: "",
          html: "🚚",
          iconSize: [24, 24],
        }),
      })
        .addTo(map)
        .bindPopup("Hauler");
    } else {
      haulerMarkerRef.current.setLatLng(pos);
    }

    if (lineRef.current) map.removeLayer(lineRef.current);
    lineRef.current = L.polyline([pos, [dropoff.lat, dropoff.lng]], {
      color: "#15803d",
      dashArray: "6 6",
    }).addTo(map);

    map.fitBounds(
      L.latLngBounds([pos, [dropoff.lat, dropoff.lng], ...pickups.map((p) => [p.lat, p.lng] as [number, number])]),
      { padding: [30, 30] }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const stale =
    location?.available && now - new Date(location.lastPingAt).getTime() > STALE_THRESHOLD_MS;

  const distanceKm =
    location?.available && !stale
      ? haversineDistanceKm({ lat: location.lat, lng: location.lng }, dropoff)
      : null;
  const etaMinutes = distanceKm != null ? estimateEtaMinutes(distanceKm) : null;
  const etaTime =
    etaMinutes != null ? new Date(now + etaMinutes * 60_000) : null;

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-lg border border-black/10" />
      {location?.available && !stale && (
        <p className="text-xs text-neutral-500">
          Last updated {Math.max(0, Math.round((now - new Date(location.lastPingAt).getTime()) / 1000))}s
          ago
        </p>
      )}
      {location && (!location.available || stale) && (
        <p className="text-xs text-amber-700">
          {stale && location.available
            ? `📍 Location unavailable — last seen ${new Date(location.lastPingAt).toLocaleTimeString()}.`
            : location.available === false && location.reason === "settled"
              ? "This order has been settled — live tracking is no longer shown."
              : "📍 Waiting for the hauler's first location update…"}
        </p>
      )}
      {etaMinutes != null && etaTime && (
        <p className="text-sm font-medium text-brand-green-700">
          Estimated delivery: {etaTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{" "}
          (in ~{etaMinutes} min)
          <span className="ml-1 text-xs font-normal text-neutral-400">
            — straight-line estimate, not real routing
          </span>
        </p>
      )}
    </div>
  );
}
