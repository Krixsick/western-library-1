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
  areas: Record<string, number | "Closed">;
  totalOccupancy: number | null;
  busynessLevel: "low" | "moderate" | "busy" | "closed" | "unknown";
  lastUpdated: string | null;
  source?: string;
  recHours?: {
    open: string | null;
    close: string | null;
    isOpen: boolean;
  };
}
