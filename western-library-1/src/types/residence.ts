export interface Residence {
  id: string;
  name: string;
  lat: number;
  log: number;
  rating: number;

  image?: string;
  hours?: Record<string, string | null>;
}

export interface MealPeriod {
  label: string;
  start: string;
  end: string;
}

export interface DiningHall {
  name: string;
  isOpen: boolean;
  currentMeal: string | null;
  currentMealEnd: string | null;
  nextMeal: string | null;
  nextMealStart: string | null;
  meals: Record<string, MealPeriod>;
  closed: boolean;
  note: string | null;
}

export interface DiningData {
  halls: Record<string, DiningHall>;
  lastUpdated: string | null;
}
