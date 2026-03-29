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
  hours?: Record<string, LibraryHours | null>;
}
