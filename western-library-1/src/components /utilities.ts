import type { Library } from "../types/library";
import { useState, useEffect } from "react";
import { libraries } from "../data/libraries";
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export function isLibraryOpen(library: Library): boolean {
  const now = new Date();
  const day = DAYS[now.getDay()];
  const hours = library?.hours[day];
  if (!hours) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = hours.open.split(":").map(Number);
  const [closeH, closeM] = hours.close.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export function useLibraries(): Library[] {
  const [libs, setLibs] = useState<Library[]>(libraries);
  useEffect(() => {
    async function fetchHours() {
      try {
        const res = await fetch("http://localhost:3001/api/library/data");
        const hoursData = await res.json();
        setLibs((prev) =>
          prev.map((lib) => {
            const scraped = hoursData[lib.id];
            if (scraped) {
              return { ...lib, hours: scraped };
            }
            return lib;
          }),
        );
      } catch (err) {
        console.error("Failed to fetch hours:", err);
      }
    }

    fetchHours();
  }, []);

  return libs;
}
