"use client";

import { useEffect, useRef } from "react";

/** Approximate area to show (e.g. a district center). Only moves the map; never sets lat/lng. */
export interface MapFocus {
  lat: number;
  lng: number;
  zoom: number;
  /** Bump to re-apply the same focus. */
  key: number;
}

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  focus?: MapFocus | null;
}

export default function LocationPicker({ lat, lng, onChange, focus = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const positionRef = useRef(lat != null && lng != null ? [lat, lng] as [number, number] : null);
  const focusRef = useRef(focus);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    positionRef.current = lat != null && lng != null ? [lat, lng] : null;
    focusRef.current = focus;
  }, [lat, lng, focus]);

  useEffect(() => {
    let disposed = false;
    async function init() {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;
      const position = positionRef.current;
      const pending = focusRef.current;
      const map = L.map(containerRef.current, {
        center: position ?? (pending ? [pending.lat, pending.lng] : [13.0, 101.0]),
        zoom: position ? 14 : pending ? pending.zoom : 6,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => onChangeRef.current(event.latlng.lat, event.latlng.lng));
      if (position) markerRef.current = L.marker(position).addTo(map);
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
      if (!map) return;
      if (lat == null || lng == null) {
        // Coordinates cleared (e.g. province/district changed): drop the stale pin.
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }
      const L = await import("leaflet");
      if (cancelled || mapRef.current !== map) return;
      if (!markerRef.current) markerRef.current = L.marker([lat, lng]).addTo(map);
      else markerRef.current.setLatLng([lat, lng]);
      map.panTo([lat, lng]);
    }
    void sync();
    return () => { cancelled = true; };
  }, [lat, lng]);

  useEffect(() => {
    if (focus) mapRef.current?.flyTo([focus.lat, focus.lng], focus.zoom, { duration: 0.8 });
  }, [focus]);

  return <div ref={containerRef} className="h-60 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-72" aria-label="ปักหมุดตำแหน่งทรัพย์" />;
}
