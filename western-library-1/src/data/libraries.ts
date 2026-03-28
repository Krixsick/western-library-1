export interface LibraryHours {
  open: string; // "HH:MM" 24h format
  close: string;
}

export interface Library {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hours: Record<string, LibraryHours | null>; // day name -> hours, null = closed
  rating: number;
  image: string;
}

export const libraries: Library[] = [
  {
    id: "weldon",
    name: "Weldon Library",
    lat: 43.0088,
    lng: -81.2742,
    hours: {
      Monday: { open: "07:30", close: "23:00" },
      Tuesday: { open: "07:30", close: "23:00" },
      Wednesday: { open: "07:30", close: "23:00" },
      Thursday: { open: "07:30", close: "23:00" },
      Friday: { open: "07:30", close: "21:00" },
      Saturday: { open: "10:00", close: "18:00" },
      Sunday: { open: "10:00", close: "23:00" },
    },
    rating: 4.5,
    image: "",
  },
  {
    id: "taylor",
    name: "Taylor Library",
    lat: 43.0094,
    lng: -81.2668,
    hours: {
      Monday: { open: "08:00", close: "22:00" },
      Tuesday: { open: "08:00", close: "22:00" },
      Wednesday: { open: "08:00", close: "22:00" },
      Thursday: { open: "08:00", close: "22:00" },
      Friday: { open: "08:00", close: "18:00" },
      Saturday: { open: "10:00", close: "18:00" },
      Sunday: { open: "12:00", close: "22:00" },
    },
    rating: 4.3,
    image: "",
  },
  {
    id: "allyn-betty-taylor",
    name: "Allyn & Betty Taylor Library",
    lat: 43.0104,
    lng: -81.2734,
    hours: {
      Monday: { open: "08:00", close: "23:00" },
      Tuesday: { open: "08:00", close: "23:00" },
      Wednesday: { open: "08:00", close: "23:00" },
      Thursday: { open: "08:00", close: "23:00" },
      Friday: { open: "08:00", close: "20:00" },
      Saturday: { open: "10:00", close: "18:00" },
      Sunday: { open: "10:00", close: "23:00" },
    },
    rating: 4.6,
    image: "",
  },
  {
    id: "music-library",
    name: "Music Library",
    lat: 43.0099,
    lng: -81.2761,
    hours: {
      Monday: { open: "08:30", close: "21:00" },
      Tuesday: { open: "08:30", close: "21:00" },
      Wednesday: { open: "08:30", close: "21:00" },
      Thursday: { open: "08:30", close: "21:00" },
      Friday: { open: "08:30", close: "17:00" },
      Saturday: null,
      Sunday: null,
    },
    rating: 4.2,
    image: "",
  },
  {
    id: "education-library",
    name: "Education Library",
    lat: 43.0112,
    lng: -81.2717,
    hours: {
      Monday: { open: "08:00", close: "22:00" },
      Tuesday: { open: "08:00", close: "22:00" },
      Wednesday: { open: "08:00", close: "22:00" },
      Thursday: { open: "08:00", close: "22:00" },
      Friday: { open: "08:00", close: "17:00" },
      Saturday: { open: "10:00", close: "17:00" },
      Sunday: { open: "12:00", close: "22:00" },
    },
    rating: 4.1,
    image: "",
  },
  {
    id: "law-library",
    name: "John & Dotsa Chicken Law Library",
    lat: 43.0072,
    lng: -81.2748,
    hours: {
      Monday: { open: "08:00", close: "23:00" },
      Tuesday: { open: "08:00", close: "23:00" },
      Wednesday: { open: "08:00", close: "23:00" },
      Thursday: { open: "08:00", close: "23:00" },
      Friday: { open: "08:00", close: "18:00" },
      Saturday: { open: "10:00", close: "18:00" },
      Sunday: { open: "10:00", close: "23:00" },
    },
    rating: 4.4,
    image: "",
  },
  {
    id: "business-library",
    name: "Business Library (Ivey)",
    lat: 43.0052,
    lng: -81.2756,
    hours: {
      Monday: { open: "08:00", close: "22:00" },
      Tuesday: { open: "08:00", close: "22:00" },
      Wednesday: { open: "08:00", close: "22:00" },
      Thursday: { open: "08:00", close: "22:00" },
      Friday: { open: "08:00", close: "18:00" },
      Saturday: { open: "10:00", close: "17:00" },
      Sunday: { open: "12:00", close: "22:00" },
    },
    rating: 4.7,
    image: "",
  },
  {
    id: "dbweldon",
    name: "D.B. Weldon Library (Sciences)",
    lat: 43.0093,
    lng: -81.2752,
    hours: {
      Monday: { open: "08:00", close: "22:00" },
      Tuesday: { open: "08:00", close: "22:00" },
      Wednesday: { open: "08:00", close: "22:00" },
      Thursday: { open: "08:00", close: "22:00" },
      Friday: { open: "08:00", close: "18:00" },
      Saturday: { open: "10:00", close: "18:00" },
      Sunday: { open: "12:00", close: "22:00" },
    },
    rating: 4.0,
    image: "",
  },
];

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
  const hours = library.hours[day];
  if (!hours) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = hours.open.split(":").map(Number);
  const [closeH, closeM] = hours.close.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}
