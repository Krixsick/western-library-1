export interface LibraryHours {
  open: string;
  close: string;
}

export interface Library {
  id: string;
  name: string;
  lat: number;
  log: number;
  rating: number;
  image?: string;
  hours?: Record<string, string | null>;
}

export interface RecBusyness {
  weightRoom: number | null;
  cardioMezzanine: number | null;
  spinRoom: number | null;
  totalOccupancy: number | null;
  busynessLevel: "low" | "moderate" | "busy" | "unknown";
  lastUpdated: string | null;
  caption?: string;
  source?: string;
  stale?: boolean;
}
