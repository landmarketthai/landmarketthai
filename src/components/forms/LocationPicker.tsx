"use client";

import { useEffect, useRef, useState } from "react";

/** Area to show (district center, or an exact pin from a Google Maps link). Only moves the map; never sets lat/lng. */
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
  disabled?: boolean;
}

export default function LocationPicker({ lat, lng, onChange, focus = null, disabled = false }: Props) {
  const [mapReady, setMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
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
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        if (!disabledRef.current) onChangeRef.current(event.latlng.lat, event.latlng.lng);
      });
      mapRef.current = map;
      setMapReady(true);
    }
    void init();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      setMapReady(false);
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
      // A pin that arrives with a matching focus (Google Maps link) is zoomed by flyTo; panTo would cancel it.
      const pending = focusRef.current;
      if (!(pending && pending.lat === lat && pending.lng === lng)) map.panTo([lat, lng]);
    }
    void sync();
    return () => { cancelled = true; };
  }, [lat, lng, mapReady]);

  useEffect(() => {
    if (focus) mapRef.current?.flyTo([focus.lat, focus.lng], focus.zoom, { duration: 0.8 });
  }, [focus, mapReady]);

  return <div ref={containerRef} className="h-60 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-72" aria-label="ปักหมุดตำแหน่งทรัพย์" />;
}
