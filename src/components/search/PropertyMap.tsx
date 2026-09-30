"use client";

import { useEffect, useRef, useState } from "react";
import type { Land } from "@/lib/types/database";

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface Props {
  properties: Land[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  className?: string;
  interactive?: boolean;
  scrollWheelZoom?: boolean;
}

function markerLabel(property: Land): string {
  const price = property.transaction_type === "rent" ? property.rent_price_monthly : property.total_price;
  if (!price) return property.status === "sold" ? "Sold" : "ดูทรัพย์";
  if (price >= 1_000_000) return `${(price / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ล.`;
  return `${Math.round(price / 1_000).toLocaleString("th-TH")}k`;
}

export default function PropertyMap({
  properties,
  selectedId,
  onSelect,
  onBoundsChange,
  className = "h-full min-h-[420px]",
  interactive = true,
  scrollWheelZoom = interactive,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const clusterRef = useRef<import("leaflet").MarkerClusterGroup | null>(null);
  const markerRefs = useRef(new Map<string, import("leaflet").Marker>());
  const onSelectRef = useRef(onSelect);
  const onBoundsRef = useRef(onBoundsChange);
  const suppressBoundsRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onBoundsRef.current = onBoundsChange;
  }, [onSelect, onBoundsChange]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function mount() {
      if (!containerRef.current || mapRef.current) return;
      const leaflet = await import("leaflet");
      await import("leaflet.markercluster");
      const L = (leaflet.default ?? leaflet) as typeof import("leaflet");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [13.2, 101.2],
        zoom: 7,
        zoomControl: true,
        scrollWheelZoom,
        dragging: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 52,
        spiderfyOnMaxZoom: true,
      });
      cluster.addTo(map);
      mapRef.current = map;
      clusterRef.current = cluster;
      setReady(true);

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }));
        resizeObserver.observe(containerRef.current);
      }
      requestAnimationFrame(() => map.invalidateSize({ animate: false }));

      if (interactive) {
        map.on("moveend", () => {
          if (suppressBoundsRef.current) {
            suppressBoundsRef.current = false;
            return;
          }
          const bounds = map.getBounds();
          onBoundsRef.current?.({
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          });
        });
      }
    }

    void mount();
    const markers = markerRefs.current;
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markers.clear();
    };
  }, [interactive, scrollWheelZoom]);

  useEffect(() => {
    let cancelled = false;
    async function syncMarkers() {
      const map = mapRef.current;
      const cluster = clusterRef.current;
      if (!map || !cluster) return;
      const leaflet = await import("leaflet");
      const L = (leaflet.default ?? leaflet) as typeof import("leaflet");
      if (cancelled) return;

      cluster.clearLayers();
      markerRefs.current.clear();
      const points: import("leaflet").LatLngExpression[] = [];

      for (const property of properties) {
        if (property.lat == null || property.lng == null) continue;
        const selected = selectedId === property.id;
        const icon = L.divIcon({
          className: "property-price-marker-wrap",
          html: `<span class="property-price-marker${selected ? " is-selected" : ""}${property.status === "sold" ? " is-sold" : ""}">${markerLabel(property)}</span>`,
          iconSize: [74, 34],
          iconAnchor: [37, 17],
        });
        const marker = L.marker([property.lat, property.lng], { icon, title: property.title_th });
        marker.on("click", () => onSelectRef.current?.(property.id));
        const tooltip = document.createElement("span");
        tooltip.textContent = property.title_th;
        marker.bindTooltip(tooltip, { direction: "top", offset: [0, -14] });
        markerRefs.current.set(property.id, marker);
        cluster.addLayer(marker);
        points.push([property.lat, property.lng]);
      }

      if (points.length && !selectedId) {
        const bounds = L.latLngBounds(points);
        suppressBoundsRef.current = true;
        map.fitBounds(bounds.pad(0.25), { maxZoom: 13, animate: false });
      }
      if (selectedId) {
        const selected = properties.find((item) => item.id === selectedId && item.lat != null && item.lng != null);
        if (selected) {
          suppressBoundsRef.current = true;
          map.flyTo([selected.lat!, selected.lng!], Math.max(map.getZoom(), 13), { duration: 0.4 });
        }
      }
    }
    void syncMarkers();
    return () => {
      cancelled = true;
    };
  }, [properties, ready, selectedId]);

  const geocodedCount = properties.filter((item) => item.lat != null && item.lng != null).length;

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" aria-label="แผนที่ทรัพย์" />
      {geocodedCount === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-slate-50/90 p-6 text-center text-sm text-slate-500">
          ยังไม่มีพิกัดจริงสำหรับทรัพย์ในผลการค้นหานี้
        </div>
      )}
    </div>
  );
}
