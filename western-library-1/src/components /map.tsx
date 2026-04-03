import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  isLibraryOpen,
  useLibraries,
  useRecBusyness,
  useDiningHours,
} from "./utilities";
import type { Library } from "../types/library";
import { recCenter, residences } from "../data/libraries";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [-81.2737, 43.0096];
const DEFAULT_ZOOM = 15.5;
const DEFAULT_PITCH = 50;
const DEFAULT_BEARING = 30;

export function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleLoaded = useRef(false);
  const { libraries, loading } = useLibraries();
  const { busyness } = useRecBusyness();
  const { dining } = useDiningHours();

  const resetMap = () => {
    mapRef.current?.flyTo({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      duration: 1500,
    });
  };

  const flyToMe = () => {
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
  };

  // Effect 1: Initialize map once
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/standard",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      antialias: true,
    });

    // Coordinate display overlay
    // const coordDisplay = document.createElement("div");
    // coordDisplay.style.cssText =
    //   "position:absolute;bottom:12px;left:12px;z-index:10;background:#1a1a1b99;backdrop-filter:blur(8px);color:#d7ccc8;padding:6px 10px;border-radius:6px;font-size:12px;font-family:monospace;pointer-events:none;opacity:0;transition:opacity 0.2s;";
    // mapContainer.current.appendChild(coordDisplay);

    // mapRef.current.on("mousemove", (e) => {
    //   const { lng, lat } = e.lngLat;
    //   coordDisplay.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    //   coordDisplay.style.opacity = "1";
    // });

    // mapRef.current.on("mouseout", () => {
    //   coordDisplay.style.opacity = "0";
    // });

    // mapRef.current.on("click", (e) => {
    //   const { lng, lat } = e.lngLat;
    //   console.log(`lat: ${lat}, lng: ${lng}`);
    // });

    mapRef.current.on("style.load", () => {
      mapRef.current?.setConfigProperty("basemap", "lightPreset", "dusk");
      mapRef.current?.setConfigProperty(
        "basemap",
        "showPointOfInterestLabels",
        false,
      );
      styleLoaded.current = true;
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      styleLoaded.current = false;
    };
  }, []);

  // Effect 2: Add/update markers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers: mapboxgl.Marker[] = [];
    const popups: mapboxgl.Popup[] = [];

    function addMarkers() {
      // Library markers
      libraries.forEach((lib: Library) => {
        const isOpen = isLibraryOpen(lib);

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

        el.addEventListener("click", () => {
          mapRef.current?.flyTo({
            center: [lib.log, lib.lat],
            //affects how much we zoom in when clicking on the marker, higher closer, lower further
            zoom: 17,
            pitch: 55,
            bearing: DEFAULT_BEARING,
            duration: 1500,
          });
        });

        const popup = new mapboxgl.Popup({
          offset: 12,
          closeButton: false,
          closeOnClick: false,
          className: "library-popup",
        }).setHTML(
          `<div style="font-size:13px;font-weight:600;padding:2px 4px;">
            ${lib.name}
            <span style="color:${isOpen ? "#22c55e" : "#ef4444"};margin-left:6px;">
              ${isOpen ? "Open" : "Closed"}
            </span>
          </div>`,
        );

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lib.log, lib.lat])
          .setPopup(popup)
          .addTo(mapRef.current!);

        el.addEventListener("mouseenter", () => popup.addTo(mapRef.current!));
        el.addEventListener("mouseleave", () => popup.remove());

        markers.push(marker);
        popups.push(popup);
      });

      // Rec center marker
      const busynessColors: Record<string, string> = {
        low: "#22c55e",
        moderate: "#f1a625ff",
        busy: "#f18080ff",
        unknown: "#6b7280",
      };

      const level = busyness?.busynessLevel || "unknown";
      const color = busynessColors[level];

      const recEl = document.createElement("div");
      recEl.style.width = "20px";
      recEl.style.height = "20px";
      recEl.style.borderRadius = "4px";
      recEl.style.cursor = "pointer";
      recEl.style.border = "2px solid white";
      recEl.style.backgroundColor = color;
      recEl.style.boxShadow = `0 0 10px ${color}, 0 0 20px ${color}80`;

      recEl.addEventListener("click", () => {
        mapRef.current?.flyTo({
          center: [recCenter.log, recCenter.lat],
          zoom: 17,
          pitch: 55,
          bearing: DEFAULT_BEARING,
          duration: 1500,
        });
      });

      const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

      // Format area labels for display
      const areaLabels: Record<string, string> = {
        squash: "Squash",
        basketball: "Basketball",
        volleyball: "Volleyball",
        badminton: "Badminton",
        futsal: "Futsal",
        pickleball: "Pickleball",
        thirdFloorFitness: "3rd Floor Fitness",
        fourthFloorFitness: "4th Floor Fitness",
        cardioMezz: "Cardio Mezz",
        spin: "Spin",
        womensOnlyStudio: "Women's Only Studio",
        pool: "Pool",
      };

      const areaEntries = busyness?.areas ? Object.entries(busyness.areas) : [];

      const areasHtml = areaEntries
        .map(([key, val]) => {
          const label = areaLabels[key] || key;
          const display =
            val === "Closed"
              ? `<span style="color:#000000;">Closed</span>`
              : val;
          return `<div style="color:#000000">${label}: ${display}</div>`;
        })
        .join("");

      let updatedText = "";
      if (busyness?.lastUpdated) {
        const ago = Math.round(
          (Date.now() - new Date(busyness.lastUpdated).getTime()) / 60000,
        );
        updatedText = ago < 1 ? "Just now" : `${ago} min ago`;
      }

      const recPopup = new mapboxgl.Popup({
        offset: 14,
        closeButton: false,
        closeOnClick: false,
        className: "library-popup",
      }).setHTML(
        `<div style="font-size:13px;padding:4px 6px;">
          <div style="font-weight:600;">${recCenter.name}</div>
          <div style="margin-top:4px;">
            <span style="color:${color};font-weight:600;">${levelLabel}</span>
            ${busyness?.totalOccupancy != null ? `<span style="color:#000000;margin-left:6px;">${busyness.totalOccupancy} total</span>` : ""}
          </div>
          ${areasHtml ? `<div style="font-size:11px;color:#ccc;margin-top:4px;line-height:1.5;">${areasHtml}</div>` : ""}
          ${updatedText ? `<div style="font-size:10px;color:#aaa;margin-top:4px;">Updated ${updatedText}</div>` : ""}
        </div>`,
      );

      const recMarker = new mapboxgl.Marker({ element: recEl })
        .setLngLat([recCenter.log, recCenter.lat])
        .setPopup(recPopup)
        .addTo(mapRef.current!);

      recEl.addEventListener("mouseenter", () =>
        recPopup.addTo(mapRef.current!),
      );
      recEl.addEventListener("mouseleave", () => recPopup.remove());

      markers.push(recMarker);
      popups.push(recPopup);

      // Dining hall markers (diamond shape)
      residences.forEach((res) => {
        const hall = dining?.halls?.[res.id];

        let diningColor: string;
        let statusText: string;

        if (!hall) {
          diningColor = "#6b7280"; // gray — no data
          statusText = "No data";
        } else if (hall.closed) {
          diningColor = "#ef4444"; // red — closed today
          statusText = hall.note ? `Closed (${hall.note})` : "Closed Today";
        } else if (hall.currentMeal) {
          diningColor = "#22c55e"; // green — serving a meal
          statusText = `Serving ${hall.currentMeal}`;
        } else if (hall.isOpen) {
          diningColor = "#f1a625"; // amber — open but between meals
          statusText = "Between Meals";
        } else {
          diningColor = "#ef4444"; // red — closed right now
          statusText = "Closed";
        }

        const dEl = document.createElement("div");
        dEl.style.width = "14px";
        dEl.style.height = "14px";
        dEl.style.transform = "rotate(45deg)";
        dEl.style.cursor = "pointer";
        dEl.style.border = "2px solid white";
        dEl.style.backgroundColor = diningColor;
        dEl.style.boxShadow = `0 0 10px ${diningColor}, 0 0 20px ${diningColor}80`;

        dEl.addEventListener("click", () => {
          mapRef.current?.flyTo({
            center: [res.log, res.lat],
            zoom: 17,
            pitch: 55,
            bearing: DEFAULT_BEARING,
            duration: 1500,
          });
        });

        // Build popup content
        let mealInfo = "";
        if (hall?.currentMeal && hall.currentMealEnd) {
          mealInfo += `<div style="margin-top:4px;"><span style="color:${diningColor};font-weight:600;">${statusText}</span><span style="color:#888;margin-left:6px;">until ${hall.currentMealEnd}</span></div>`;
        } else {
          mealInfo += `<div style="margin-top:4px;"><span style="color:${diningColor};font-weight:600;">${statusText}</span></div>`;
        }

        if (hall?.nextMeal && hall.nextMealStart) {
          mealInfo += `<div style="font-size:11px;color:#888;margin-top:2px;">Next: ${hall.nextMeal} at ${hall.nextMealStart}</div>`;
        }

        // List all meal times
        if (hall?.meals && Object.keys(hall.meals).length > 0) {
          const mealsHtml = Object.values(hall.meals)
            .map((m) => `<div>${m.label}: ${m.start} – ${m.end}</div>`)
            .join("");
          mealInfo += `<div style="font-size:10px;color:#aaa;margin-top:4px;line-height:1.4;">${mealsHtml}</div>`;
        }

        const dPopup = new mapboxgl.Popup({
          offset: 12,
          closeButton: false,
          closeOnClick: false,
          className: "library-popup",
        }).setHTML(
          `<div style="font-size:13px;padding:4px 6px;">
            <div style="font-weight:600;">${res.name}</div>
            ${mealInfo}
          </div>`,
        );

        const dMarker = new mapboxgl.Marker({ element: dEl })
          .setLngLat([res.log, res.lat])
          .setPopup(dPopup)
          .addTo(mapRef.current!);

        dEl.addEventListener("mouseenter", () => dPopup.addTo(mapRef.current!));
        dEl.addEventListener("mouseleave", () => dPopup.remove());

        markers.push(dMarker);
        popups.push(dPopup);
      });
    }

    // If style is already loaded, add markers now
    // Otherwise wait for style.load
    if (styleLoaded.current) {
      addMarkers();
    } else {
      map.on("style.load", addMarkers);
    }

    // Cleanup: remove old markers before adding new ones
    return () => {
      markers.forEach((m) => m.remove());
      popups.forEach((p) => p.remove());
      map.off("style.load", addMarkers);
    };
  }, [libraries, busyness, dining]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {loading && (
        <div className="w-full h-full flex items-center justify-center bg-background">
          <p className="text-tertiary text-sm animate-pulse">
            Loading library hours...
          </p>
        </div>
      )}

      {!loading && (
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
      )}
    </div>
  );
}
