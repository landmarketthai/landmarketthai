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
      if (!markerRef.current) {
        markerRef.current = L.marker([lat, lng], {
          title: "ตำแหน่งทรัพย์",
          alt: "หมุดตำแหน่งทรัพย์",
          icon: L.divIcon({
            className: "sell-location-pin-wrap",
            html: '<span class="sell-location-pin" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24" fill="currentColor"><path d="M18.364 4.636a9 9 0 0 1 .203 12.519l-.203 .21l-4.243 4.242a3 3 0 0 1 -4.097 .135l-.144 -.135l-4.244 -4.243a9 9 0 0 1 12.728 -12.728zm-6.364 3.364a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" /></svg></span>',
            iconSize: [38, 38],
            iconAnchor: [19, 35],
          }),
        }).addTo(map);
      } else {
        markerRef.current.setLatLng([lat, lng]);
      }
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
