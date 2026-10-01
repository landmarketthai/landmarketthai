"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { Land } from "@/lib/types/database";
import { hasCoordinates, LISTING_STATUS_LABELS, listingUpdatedLabel } from "@/lib/property-search";
import { resolveListingPresentation } from "@/lib/seed-listings";
import { formatMoney, listingHref } from "@/lib/utils";

export default function PropertyMap({ listings, selectedId, onSelect, className = "h-[480px]" }: {
  listings: Land[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const library = useRef<typeof Leaflet | null>(null);
  const select = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { select.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const points = listings.filter(hasCoordinates);
    if (!container.current || !points.length) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    const currentMarkers = markers.current;
    setReady(false);
    setError("");
    import("leaflet").then((L) => {
      if (cancelled || !container.current) return;
      library.current = L;
      const view = L.map(container.current, { scrollWheelZoom: false }).setView([13.5, 101.5], 7);
      map.current = view;
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).on("tileerror", () => setError("โหลดพื้นหลังแผนที่ไม่ได้ ยังเลือกหมุดและดูรายการได้"))
        .on("tileload", () => setError(""))
        .addTo(view);
      listings.forEach((land, position) => {
        if (!hasCoordinates(land)) return;
        const index = position + 1;
        const marker = L.marker([land.lat, land.lng], {
          title: `${index}. ${land.title_th}`,
          alt: `เลือกแปลง ${land.title_th}`,
          icon: L.divIcon({ className: "property-map-marker", html: String(index), iconSize: [40, 40], iconAnchor: [20, 20] }),
        }).addTo(view);
        marker.getElement()?.setAttribute("aria-label", `${index}. ${land.title_th}`);
        const popup = document.createElement("div");
        const link = document.createElement("a");
        link.href = resolveListingPresentation(land).hrefOverride ?? listingHref(land.public_ref, land.slug);
        link.textContent = land.title_th;
        link.className = "font-bold text-blue-800 underline";
        popup.append(link);
        const summary = document.createElement("p");
        summary.textContent = `${land.price_per_rai == null ? "ยังไม่ระบุราคา" : `${formatMoney(land.price_per_rai)} บาท/ไร่`} · ${LISTING_STATUS_LABELS[land.status]} · อัปเดต ${listingUpdatedLabel(land.updated_at)}`;
        popup.append(summary);
        const precision = document.createElement("p");
        precision.textContent = land.location_precision === "approx" ? "ตำแหน่งโดยประมาณ" : "พิกัดแปลง";
        popup.append(precision);
        marker.bindPopup(popup).on("click", () => select.current(land.id));
        currentMarkers.set(land.id, marker);
      });
      view.fitBounds(L.latLngBounds(points.map((land) => [land.lat, land.lng])), { padding: [45, 45], maxZoom: 14 });
      observer = new ResizeObserver(() => view.invalidateSize());
      observer.observe(container.current);
      setReady(true);
    }).catch(() => { if (!cancelled) setError("โหลดแผนที่ไม่ได้ กรุณาดูรายการด้านข้าง"); });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
      currentMarkers.clear();
    };
  }, [listings]);

  useEffect(() => {
    if (!ready || !library.current || !map.current) return;
    markers.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle("selected", id === selectedId);
      marker.getElement()?.setAttribute("aria-pressed", String(id === selectedId));
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    });
    const marker = selectedId ? markers.current.get(selectedId) : undefined;
    if (marker) {
      map.current.panTo(marker.getLatLng());
      marker.openPopup();
    } else map.current.closePopup();
  }, [selectedId, ready, listings]);

  const count = listings.filter(hasCoordinates).length;
  return (
    <div className={`relative isolate overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${className}`}>
      <div ref={container} className="h-full w-full" role="region" aria-label={`แผนที่ทรัพย์ ${count} หมุด`} />
      {!count && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-600">ไม่มีพิกัดสำหรับรายการนี้ ดูรายละเอียดจากการ์ดได้</p>}
      {count > 0 && !ready && !error && <p className="absolute left-4 top-4 z-[1000] rounded bg-white p-3 text-sm" role="status">กำลังโหลดแผนที่…</p>}
      {error && <p className="absolute inset-x-4 top-4 z-[1000] rounded bg-white p-3 text-sm" role="status">{error}</p>}
    </div>
  );
}
