import { useState, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_CENTER: [number, number] = [-81.2737, 43.0096];
const DEFAULT_ZOOM = 15.5;
const DEFAULT_PITCH = 50;
const DEFAULT_BEARING = 30;

export function Map() {
  return (
    <div>
      <p>w</p>
    </div>
  );
}
