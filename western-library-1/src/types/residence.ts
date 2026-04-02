export interface Residence {
  id: string;
  name: string;
  lat: number;
  log: number;
  rating: number;

  image?: string;
  hours?: Record<string, string | null>;
}
