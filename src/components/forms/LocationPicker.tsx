"use client";

import { useEffect, useRef } from "react";

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

export default function LocationPicker({ lat, lng, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const initialPositionRef = useRef(lat != null && lng != null ? [lat, lng] as [number, number] : null);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let disposed = false;
    async function init() {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;
      const map = L.map(containerRef.current, { center: initialPositionRef.current ?? [13.0, 101.0], zoom: initialPositionRef.current ? 14 : 7 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => onChangeRef.current(event.latlng.lat, event.latlng.lng));
      mapRef.current = map;
    }
    void init();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      const map = mapRef.current;
      if (!map || lat == null || lng == null) return;
      const L = await import("leaflet");
      if (cancelled) return;
      if (!markerRef.current) markerRef.current = L.marker([lat, lng]).addTo(map);
      else markerRef.current.setLatLng([lat, lng]);
      map.panTo([lat, lng]);
    }
    void sync();
    return () => { cancelled = true; };
  }, [lat, lng]);

  return <div ref={containerRef} className="h-60 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-72" aria-label="ปักหมุดตำแหน่งทรัพย์" />;
}
