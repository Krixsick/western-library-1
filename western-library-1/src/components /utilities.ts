import type { Library } from "../types/library";
import type { RecBusyness } from "../types/library";
import type { DiningData } from "../types/residence";
import { useState, useEffect } from "react";
import { libraries } from "../data/libraries";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
  if (!library.hours) return false;

  const now = new Date();
  const day = DAYS[now.getDay()];
  const hours = library.hours[day];
  if (!hours) return false;

  // hours is a string like "9am – 11pm"
  const parts = hours.split(/\s*[–-]\s*/);
  if (parts.length !== 2) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = parseTimeToMinutes(parts[0]);
  const closeMinutes = parseTimeToMinutes(parts[1]);

  if (openMinutes === null || closeMinutes === null) return false;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = match[2] ? parseInt(match[2]) : 0;
  const period = match[3].toLowerCase();
  if (period === "pm" && h !== 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  return h * 60 + m;
}

export function useLibraries() {
  const [libs, setLibs] = useState(libraries);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function fetchHours() {
      try {
        const res = await fetch(`${API_URL}/api/library/data`);
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
      } finally {
        setLoading(false);
      }
    }

    fetchHours();
  }, []);

  return { libraries: libs, loading };
}

export function useRecBusyness() {
  const [busyness, setBusyness] = useState<RecBusyness | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBusyness() {
      try {
        const res = await fetch(`${API_URL}/api/rec/data`);
        const data = await res.json();
        setBusyness(data);
      } catch (err) {
        console.error("Failed to fetch rec busyness:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchBusyness();
    const interval = setInterval(fetchBusyness, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { busyness, loading };
}

export function useDiningHours() {
  const [dining, setDining] = useState<DiningData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDining() {
      try {
        const res = await fetch(`${API_URL}/api/dining/data`);
        const data = await res.json();
        setDining(data);
      } catch (err) {
        console.error("Failed to fetch dining hours:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDining();
    const interval = setInterval(fetchDining, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { dining, loading };
}
