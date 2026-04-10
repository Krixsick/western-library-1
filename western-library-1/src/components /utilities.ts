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
export interface LibraryStatus {
  isOpen: boolean;
  closesAt: string | null;
  timeUntilClose: string | null;
  opensAt: string | null;
  opensDay: string | null;
  todayHours: string | null;
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

function parseDayHours(hours: Record<string, string | null>, dayName: string) {
  const h = hours[dayName];
  if (!h) return null;
  const parts = h.split(/\s*[–-]\s*/);
  if (parts.length !== 2) return null;
  const open = parseTimeToMinutes(parts[0]);
  const close = parseTimeToMinutes(parts[1]);
  if (open === null || close === null) return null;
  return { open, close, openStr: parts[0].trim(), closeStr: parts[1].trim(), raw: h };
}

function formatDuration(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getLibraryStatus(library: Library): LibraryStatus {
  const closed: LibraryStatus = {
    isOpen: false,
    closesAt: null,
    timeUntilClose: null,
    opensAt: null,
    opensDay: null,
    todayHours: null,
  };

  if (!library.hours) return closed;

  const now = new Date();
  const todayIndex = now.getDay();
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const todayParsed = parseDayHours(library.hours, DAYS[todayIndex]);

  // 1. Check if we're in yesterday's late-night session (e.g., "8am – 2am" past midnight)
  const yesterdayIndex = (todayIndex + 6) % 7;
  const yesterday = parseDayHours(library.hours, DAYS[yesterdayIndex]);
  if (yesterday && yesterday.close <= yesterday.open && currentMin < yesterday.close) {
    const minsLeft = yesterday.close - currentMin;
    return {
      isOpen: true,
      closesAt: yesterday.closeStr,
      timeUntilClose: formatDuration(minsLeft),
      opensAt: null,
      opensDay: null,
      todayHours: todayParsed?.raw ?? null,
    };
  }

  // 2. Check today's hours
  if (todayParsed) {
    const spansMidnight = todayParsed.close <= todayParsed.open;

    if (!spansMidnight) {
      // Normal same-day hours (e.g., "9am – 11pm")
      if (currentMin >= todayParsed.open && currentMin < todayParsed.close) {
        const minsLeft = todayParsed.close - currentMin;
        return {
          isOpen: true,
          closesAt: todayParsed.closeStr,
          timeUntilClose: formatDuration(minsLeft),
          opensAt: null,
          opensDay: null,
          todayHours: todayParsed.raw,
        };
      }
      if (currentMin < todayParsed.open) {
        return {
          isOpen: false,
          closesAt: null,
          timeUntilClose: null,
          opensAt: todayParsed.openStr,
          opensDay: "today",
          todayHours: todayParsed.raw,
        };
      }
      // Past close — fall through to find next opening
    } else {
      // Spans midnight (e.g., "8am – 2am")
      if (currentMin >= todayParsed.open) {
        const minsLeft = (24 * 60 - currentMin) + todayParsed.close;
        return {
          isOpen: true,
          closesAt: todayParsed.closeStr,
          timeUntilClose: formatDuration(minsLeft),
          opensAt: null,
          opensDay: null,
          todayHours: todayParsed.raw,
        };
      }
      // Between yesterday's close and today's open — closed, opens later today
      if (currentMin < todayParsed.open) {
        return {
          isOpen: false,
          closesAt: null,
          timeUntilClose: null,
          opensAt: todayParsed.openStr,
          opensDay: "today",
          todayHours: todayParsed.raw,
        };
      }
    }
  }

  // 3. Closed — scan forward up to 7 days for the next opening
  for (let i = 1; i <= 7; i++) {
    const nextIndex = (todayIndex + i) % 7;
    const next = parseDayHours(library.hours, DAYS[nextIndex]);
    if (next) {
      const dayLabel = i === 1 ? "tomorrow" : DAYS[nextIndex];
      return {
        isOpen: false,
        closesAt: null,
        timeUntilClose: null,
        opensAt: next.openStr,
        opensDay: dayLabel,
        todayHours: todayParsed?.raw ?? null,
      };
    }
  }

  return { ...closed, todayHours: todayParsed?.raw ?? null };
}

export function isLibraryOpen(library: Library): boolean {
  return getLibraryStatus(library).isOpen;
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
