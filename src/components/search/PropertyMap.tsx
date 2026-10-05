"use client";

import { useEffect, useRef, useState } from "react";
import type { Geometry } from "geojson";
import type { Land } from "@/lib/types/database";

// ponytail: keyless public tiles. OSM and Esri allow light use with attribution; move to a keyed provider
// (Esri Location Platform, MapTiler, Mapbox) before heavy commercial traffic.
const BASE_LAYERS = {
  map: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
  },
} as const;
type BaseLayer = keyof typeof BASE_LAYERS;
const BOUNDARY_ATTRIBUTION = 'ขอบเขตปกครอง: <a href="https://www.geoboundaries.org">geoBoundaries</a> (RTSD/OCHA, CC BY 3.0 IGO)';

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface Props {
  properties: Land[];
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  /** Map re-fits to the result set only when this changes (not on pan-driven refreshes). */
  fitKey?: number;
  /** Selected province/district outline; the map dims everything outside it and fits to it. */
  boundary?: Geometry | null;
  className?: string;
  interactive?: boolean;
  scrollWheelZoom?: boolean;
}

function markerPrice(property: Land): string {
  const price = property.total_price;
  if (price == null) return "สอบถามราคา";
  if (price >= 1_000_000) {
    return `฿${(price / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ล.`;
  }
  return `฿${Math.round(price / 1_000).toLocaleString("th-TH")} พัน`;
}

function markerArea(property: Land): string | null {
  if (property.size_rai != null) return `${property.size_rai.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ไร่`;
  if (property.usable_area_sqm != null) return `${property.usable_area_sqm.toLocaleString("th-TH", { maximumFractionDigits: 0 })} ตร.ม.`;
  return null;
}

/** Land buyers compare price per rai, so it leads whenever the listing has one. */
function markerHeadline(property: Land): string {
  const perRai = property.price_per_rai;
  if (perRai == null || property.size_rai == null) return markerPrice(property);
  return perRai >= 1_000_000
    ? `฿${(perRai / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ล./ไร่`
    : `฿${Math.round(perRai / 1_000).toLocaleString("th-TH")} พัน/ไร่`;
}

function markerLabel(property: Land): string {
  const area = markerArea(property);
  const verified = property.verification_status === "verified"
    ? '<span class="property-marker-verified" aria-hidden="true">✓</span>'
    : "";
  return `<span class="property-marker-main"><strong>${markerHeadline(property)}</strong>${verified}</span>${area ? `<small>${area}</small>` : ""}`;
}

function markerTitle(property: Land): string {
  const parts = [
    property.title_th,
    markerPrice(property),
    markerArea(property),
    property.verification_status === "verified" ? "ทีมงานตรวจสอบประกาศแล้ว" : null,
    property.location_precision === "exact" ? "พิกัดแบบ Exact" : "ตำแหน่งโดยประมาณ",
    property.status === "sold" ? "ขายแล้ว" : "พร้อมขาย",
  ];
  return parts.filter(Boolean).join(" · ");
}

export default function PropertyMap({
  properties,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onBoundsChange,
  fitKey = 0,
  boundary = null,
  className = "h-full min-h-[420px]",
  interactive = true,
  scrollWheelZoom = interactive,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const clusterRef = useRef<import("leaflet").MarkerClusterGroup | null>(null);
  const markerRefs = useRef(new Map<string, import("leaflet").Marker>());
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const onBoundsRef = useRef(onBoundsChange);
  const suppressBoundsRef = useRef(false);
  const userMapInteractionRef = useRef(false);
  const userInputRef = useRef(false);
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIdRef = useRef(selectedId);
  const hoveredIdRef = useRef(hoveredId);
  const lastFitKeyRef = useRef<number | null>(null);
  const fitKeyRef = useRef(fitKey);
  const [ready, setReady] = useState(0);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("map");
  const tileRef = useRef<import("leaflet").TileLayer | null>(null);
  const boundaryLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const boundaryRef = useRef(boundary);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onHoverRef.current = onHover;
    onBoundsRef.current = onBoundsChange;
    selectedIdRef.current = selectedId;
    hoveredIdRef.current = hoveredId;
    fitKeyRef.current = fitKey;
  }, [onSelect, onHover, onBoundsChange, selectedId, hoveredId, fitKey]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let interactionNode: HTMLDivElement | null = null;
    let resizeFrame: number | null = null;
    let boxZooming = false;
    const inputEvents = ["click", "dblclick", "wheel", "keydown", "touchmove"];
    const markUserMapInteraction = (event: Event) => {
      if (!event.isTrusted) return;
      // Arm motion start, not moveend: an idle click must not authorize a later resize.
      userInputRef.current = true;
      if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
      inputTimerRef.current = setTimeout(() => {
        userInputRef.current = false;
      }, event.type === "wheel" ? 100 : 0);
    };
    const finishBoxZoom = (event: Event) => {
      if (event.type === "keydown") {
        if ((event as KeyboardEvent).key === "Escape") boxZooming = false;
      } else if (boxZooming) {
        boxZooming = false;
        markUserMapInteraction(event);
      }
    };

    async function mount() {
      if (!containerRef.current || mapRef.current) return;
      const leaflet = await import("leaflet");
      await import("leaflet.markercluster");
      const L = (leaflet.default ?? leaflet) as typeof import("leaflet");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [13.2, 101.2],
        zoom: 7,
        maxZoom: 19,
        zoomControl: true,
        scrollWheelZoom,
        dragging: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
        keyboard: interactive,
        boxZoom: interactive,
        trackResize: false,
      });

      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: (zoom) => zoom < 8 ? 88 : zoom < 11 ? 68 : 48,
        disableClusteringAtZoom: 14,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (group) => L.divIcon({
          className: "property-cluster-wrap",
          html: `<span class="property-cluster"><strong>${group.getChildCount()}</strong><small>ทรัพย์</small></span>`,
          iconSize: [50, 50],
          iconAnchor: [25, 25],
        }),
      });
      cluster.addTo(map);
      mapRef.current = map;
      clusterRef.current = cluster;
      setReady((generation) => generation + 1);

      interactionNode = containerRef.current;
      if (interactive) {
        for (const event of inputEvents) interactionNode.addEventListener(event, markUserMapInteraction, true);
        document.addEventListener("mouseup", finishBoxZoom, true);
        document.addEventListener("keydown", finishBoxZoom, true);
      }

      const resize = () => {
        if (cancelled) return;
        // invalidateSize emits moveend. Preserve any real drag in progress.
        suppressBoundsRef.current = true;
        try {
          map.invalidateSize({ animate: false });
        } finally {
          suppressBoundsRef.current = false;
        }
        // A mobile map first mounted while hidden still needs its initial fit when revealed.
        if (map.getSize().x && map.getSize().y && lastFitKeyRef.current !== fitKeyRef.current) {
          setReady((generation) => generation + 1);
        }
      };
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(containerRef.current);
      }
      resizeFrame = requestAnimationFrame(resize);

      const applySemanticZoom = () => {
        const compact = map.getZoom() < 10;
        for (const marker of markerRefs.current.values()) {
          marker.getElement()?.firstElementChild?.classList.toggle("is-compact", compact);
        }
      };
      map.on("zoomend", applySemanticZoom);

      if (interactive) {
        map.on("boxzoomstart", () => { boxZooming = true; });
        map.on("dragstart", () => {
          userMapInteractionRef.current = true;
        });
        map.on("movestart zoomstart", () => {
          if (userInputRef.current) userMapInteractionRef.current = true;
          userInputRef.current = false;
        });
        map.on("moveend", () => {
          if (suppressBoundsRef.current || !userMapInteractionRef.current) return;
          userMapInteractionRef.current = false;
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
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      for (const event of inputEvents) interactionNode?.removeEventListener(event, markUserMapInteraction, true);
      document.removeEventListener("mouseup", finishBoxZoom, true);
      document.removeEventListener("keydown", finishBoxZoom, true);
      userMapInteractionRef.current = false;
      userInputRef.current = false;
      if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
      suppressBoundsRef.current = false;
      lastFitKeyRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      clusterRef.current = null;
      tileRef.current = null;
      boundaryLayerRef.current = null;
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
      if (cancelled || mapRef.current !== map || clusterRef.current !== cluster) return;

      cluster.clearLayers();
      markerRefs.current.clear();
      const points: import("leaflet").LatLngExpression[] = [];

      for (const property of properties) {
        if (property.lat == null || property.lng == null) continue;
        const compact = map.getZoom() < 10;
        const icon = L.divIcon({
          className: "property-price-marker-wrap",
          html: `<span class="property-price-marker${property.status === "sold" ? " is-sold" : ""}${property.location_precision !== "exact" ? " is-approximate" : ""}${property.verification_status === "verified" ? " is-verified" : ""}${selectedIdRef.current === property.id ? " is-selected" : ""}${hoveredIdRef.current === property.id ? " is-hovered" : ""}${compact ? " is-compact" : ""}">${markerLabel(property)}</span>`,
          iconSize: [124, 58],
          iconAnchor: [62, 58],
        });
        const marker = L.marker([property.lat, property.lng], {
          icon,
          title: markerTitle(property),
          keyboard: true,
          riseOnHover: true,
        });
        marker.on("click", () => onSelectRef.current?.(property.id));
        marker.on("mouseover", () => onHoverRef.current?.(property.id));
        marker.on("mouseout", () => onHoverRef.current?.(null));
        const tooltip = document.createElement("span");
        tooltip.textContent = `${property.title_th}${property.location_precision === "exact" ? "" : " · ตำแหน่งโดยประมาณ"}`;
        marker.bindTooltip(tooltip, { direction: "top", offset: [0, -14] });
        markerRefs.current.set(property.id, marker);
        cluster.addLayer(marker);
        points.push([property.lat, property.lng]);
      }

      // A selected area frames the map itself (see the boundary effect); otherwise frame the results.
      if (points.length && map.getSize().x && map.getSize().y && lastFitKeyRef.current !== fitKey && !boundaryRef.current) {
        lastFitKeyRef.current = fitKey;
        const bounds = L.latLngBounds(points);
        userMapInteractionRef.current = false;
        userInputRef.current = false;
        map.stop();
        map.fitBounds(bounds.pad(0.12), { maxZoom: 12, animate: false });
      }
    }
    void syncMarkers();
    return () => {
      cancelled = true;
    };
  }, [properties, ready, fitKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    void import("leaflet").then((leaflet) => {
      if (cancelled || mapRef.current !== map) return;
      const L = (leaflet.default ?? leaflet) as typeof import("leaflet");
      tileRef.current?.remove();
      tileRef.current = L.tileLayer(BASE_LAYERS[baseLayer].url, {
        attribution: BASE_LAYERS[baseLayer].attribution,
        maxZoom: 19,
      }).addTo(map);
    });
    return () => { cancelled = true; };
  }, [baseLayer, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const hadBoundary = boundaryRef.current != null;
    boundaryRef.current = boundary;
    if (!map) return;
    let cancelled = false;
    void import("leaflet").then((leaflet) => {
      if (cancelled || mapRef.current !== map) return;
      const L = (leaflet.default ?? leaflet) as typeof import("leaflet");
      if (boundaryLayerRef.current) {
        boundaryLayerRef.current.remove();
        boundaryLayerRef.current = null;
        map.attributionControl.removeAttribution(BOUNDARY_ATTRIBUTION);
      }
      if (!boundary) {
        // Area cleared: let the results frame the map again.
        if (hadBoundary) { lastFitKeyRef.current = null; setReady((generation) => generation + 1); }
        return;
      }
      const outer = (boundary.type === "Polygon" ? [boundary.coordinates] : boundary.type === "MultiPolygon" ? boundary.coordinates : [])
        .map((polygon) => polygon[0].map(([lng, lat]) => [lat, lng] as [number, number]));
      const world: [number, number][] = [[-90, -360], [-90, 360], [90, 360], [90, -360]];
      const outline = L.geoJSON(boundary, { interactive: false, style: { color: "#dc2626", weight: 3, fill: false } });
      boundaryLayerRef.current = L.layerGroup([
        // Inverted mask: the whole world minus the selected area, so the area reads as "cropped".
        L.polygon([world, ...outer], { interactive: false, stroke: false, fillColor: "#0f172a", fillOpacity: 0.35 }),
        outline,
      ]).addTo(map);
      map.attributionControl.addAttribution(BOUNDARY_ATTRIBUTION);
      if (map.getSize().x && map.getSize().y) {
        lastFitKeyRef.current = fitKeyRef.current;
        userMapInteractionRef.current = false;
        userInputRef.current = false;
        map.stop();
        map.fitBounds(outline.getBounds(), { padding: [24, 24], animate: true });
      }
    });
    return () => { cancelled = true; };
  }, [boundary, ready]);

  useEffect(() => {
    for (const [id, marker] of markerRefs.current) {
      const node = marker.getElement()?.firstElementChild;
      node?.classList.toggle("is-selected", id === selectedId);
      node?.classList.toggle("is-hovered", id === hoveredId);
      marker.setZIndexOffset(id === selectedId ? 1000 : id === hoveredId ? 500 : 0);
    }
  }, [selectedId, hoveredId, ready]);

  useEffect(() => {
    const selected = properties.find((item) => item.id === selectedId && item.lat != null && item.lng != null);
    if (selected && mapRef.current) {
      userMapInteractionRef.current = false;
      userInputRef.current = false;
      mapRef.current.stop();
      mapRef.current.flyTo([selected.lat!, selected.lng!], Math.max(mapRef.current.getZoom(), 13), { duration: 0.4 });
    }
  }, [selectedId, properties, ready]);

  const geocodedCount = properties.filter((item) => item.lat != null && item.lng != null).length;

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" aria-label="แผนที่ทรัพย์" />
      {interactive && (
        <div className="absolute bottom-7 left-3 z-[600] flex overflow-hidden rounded-lg bg-white text-xs font-bold shadow-md" role="group" aria-label="รูปแบบแผนที่">
          {([["map", "แผนที่"], ["satellite", "ดาวเทียม"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={baseLayer === key}
              onClick={() => setBaseLayer(key)}
              className={`min-h-10 px-3 ${baseLayer === key ? "bg-[#071d4a] text-white" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {geocodedCount === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-600 shadow-md">
          ยังไม่มีทรัพย์ในพื้นที่นี้
        </div>
      )}
    </div>
  );
}
