import { useState, useEffect, useCallback, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { isLibraryOpen, useLibraries } from "./utilities";
import type { Library } from "../types/library";
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [-81.2737, 43.0096];
const DEFAULT_ZOOM = 15.5;
const DEFAULT_PITCH = 50;
const DEFAULT_BEARING = 30;

export function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { libraries, loading } = useLibraries();
  const resetMap = useCallback(() => {
    mapRef.current?.flyTo({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      duration: 1500,
    });
  }, []);

  const flyToMe = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 16,
          pitch: DEFAULT_PITCH,
          bearing: DEFAULT_BEARING,
          duration: 2000,
        });
      },
      () => {
        console.warn("Geolocation permission denied");
      },
    );
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/standard",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      antialias: true,
    });

    mapRef.current = map;

    // Create a div to display coordinates
    const coordDisplay = document.createElement("div");
    coordDisplay.style.cssText =
      "position:absolute;bottom:12px;left:12px;z-index:10;background:#1a1a1b99;backdrop-filter:blur(8px);color:#d7ccc8;padding:6px 10px;border-radius:6px;font-size:12px;font-family:monospace;pointer-events:none;opacity:0;transition:opacity 0.2s;";

    map.on("mousemove", (e) => {
      const { lng, lat } = e.lngLat;
      coordDisplay.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      coordDisplay.style.opacity = "1";
    });

    map.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      console.log(`lat: ${lat}, lng: ${lng}`);
    });

    map.on("style.load", () => {
      // Configure Standard style for dark theme with 3D buildings
      map.setConfigProperty("basemap", "lightPreset", "dusk");
      map.setConfigProperty("basemap", "showPointOfInterestLabels", false);

      // Add library markers
      libraries.forEach((lib: Library) => {
        const isOpen = isLibraryOpen(lib);

        // Create custom marker element
        const el = document.createElement("div");
        el.className = "library-marker";
        el.style.width = "16px";
        el.style.height = "16px";
        el.style.borderRadius = "50%";
        el.style.cursor = "pointer";
        el.style.border = "2px solid white";

        if (isOpen) {
          el.style.backgroundColor = "#22c55e";
          el.style.boxShadow = "0 0 10px #22c55e, 0 0 20px #22c55e80";
        } else {
          el.style.backgroundColor = "#ef4444";
          el.style.boxShadow = "0 0 10px #ef4444, 0 0 20px #ef444480";
        }

        // Click handler: fly to this library
        el.addEventListener("click", () => {
          map.flyTo({
            center: [lib.log, lib.lat],
            zoom: 17,
            pitch: 55,
            bearing: DEFAULT_BEARING,
            duration: 1500,
          });
        });

        // Add tooltip on hover
        const popup = new mapboxgl.Popup({
          offset: 12,
          closeButton: false,
          closeOnClick: false,
          className: "library-popup",
        }).setHTML(
          `<div style="font-size:13px;font-weight:600;color:"#000000ff";padding:2px 4px;">
            ${lib.name}
            <span style="color:${isOpen ? "#22c55e" : "#ef4444"};margin-left:6px;">
              ${isOpen ? "Open" : "Closed"}
            </span>
          </div>`,
        );

        new mapboxgl.Marker({ element: el })
          .setLngLat([lib.log, lib.lat])
          .setPopup(popup)
          .addTo(map);

        el.addEventListener("mouseenter", () => popup.addTo(map));
        el.addEventListener("mouseleave", () => popup.remove());
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [libraries]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <p className="text-tertiary text-sm animate-pulse">
          Loading library hours...
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Control buttons */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button
          onClick={resetMap}
          className="bg-secondary/80 backdrop-blur-sm text-tertiary px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
        >
          Reset Map
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
        <button
          onClick={flyToMe}
          className="bg-secondary/80 backdrop-blur-sm text-tertiary px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
        >
          Fly to Me
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
