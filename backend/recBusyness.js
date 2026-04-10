const express = require("express");
const axios = require("axios");
const cron = require("node-cron");
const redis = require("./redis");

const router = express.Router();

const CACHE_KEY = "rec:busyness";
const CACHE_TTL = 7200; // 2 hours in seconds (generous buffer between hourly fetches)

const APIFY_TOKEN = process.env.APIFY_TOKEN;

// ── Holiday / special-date overrides (checked BEFORE seasonal schedules) ────
// Key format: "MM-DD"  →  null = fully closed, or { open, close }
// Update these each academic year based on uwo.ca/campusrec/schedules
const HOLIDAY_OVERRIDES = {
  // Good Friday — fully closed
  "04-03": null,
  // Easter Saturday — reduced hours
  "04-04": { open: "9:00", close: "17:00" },
  // Easter Sunday — reduced hours
  "04-05": { open: "9:00", close: "17:00" },
  // April 10 — closing early at 4PM (staff recognition event; pool at 2PM)
  "04-10": { open: "6:30", close: "16:00" },
  // Family Day (third Monday of Feb) — closed (Western Holiday)
  "02-16": null,
  // Canada Day
  "07-01": null,
  // Civic Holiday (first Monday of Aug) — closed (Western Holiday)
  "08-04": null,
  // Labour Day — open (per website), but could override if needed
  // "09-01": { open: "9:00", close: "17:00" },
  // Thanksgiving (second Monday of Oct) — closed (Western Holiday)
  "10-13": null,
  // Christmas Day
  "12-25": null,
  // Boxing Day
  "12-26": null,
  // New Year's Day
  "01-01": null,
};

// ── Rec center operating hours (from uwo.ca/campusrec/schedules) ──────────
// Each schedule has a date-range matcher and per-day open/close in 24h "HH:MM"
const REC_SCHEDULES = [
  {
    name: "winter",
    // Jan 4 – Apr 10
    match: (m, d) =>
      (m === 0 && d >= 4) || (m >= 1 && m <= 2) || (m === 3 && d <= 10),
    hours: {
      0: { open: "9:00", close: "23:30" }, // Sun
      1: { open: "6:30", close: "23:30" }, // Mon
      2: { open: "6:30", close: "23:30" }, // Tue
      3: { open: "6:30", close: "23:30" }, // Wed
      4: { open: "6:30", close: "23:30" }, // Thu
      5: { open: "6:30", close: "20:00" }, // Fri
      6: { open: "9:00", close: "20:00" }, // Sat
    },
  },
  {
    name: "exam",
    // Apr 11 – Apr 30
    match: (m, d) => m === 3 && d >= 11 && d <= 30,
    hours: {
      0: { open: "9:00", close: "20:00" },
      1: { open: "6:30", close: "22:00" },
      2: { open: "6:30", close: "22:00" },
      3: { open: "6:30", close: "22:00" },
      4: { open: "6:30", close: "22:00" },
      5: { open: "6:30", close: "20:00" },
      6: { open: "9:00", close: "20:00" },
    },
  },
  {
    name: "summer",
    // May 1 – Aug 31
    match: (m) => m >= 4 && m <= 7,
    hours: {
      0: { open: "9:00", close: "17:00" },
      1: { open: "6:30", close: "20:00" },
      2: { open: "6:30", close: "20:00" },
      3: { open: "6:30", close: "20:00" },
      4: { open: "6:30", close: "20:00" },
      5: { open: "6:30", close: "20:00" },
      6: { open: "9:00", close: "17:00" },
    },
  },
  {
    name: "fall",
    // Sep 1 – Dec 31 (same as winter)
    match: (m) => m >= 8 && m <= 11,
    hours: {
      0: { open: "9:00", close: "23:30" },
      1: { open: "6:30", close: "23:30" },
      2: { open: "6:30", close: "23:30" },
      3: { open: "6:30", close: "23:30" },
      4: { open: "6:30", close: "23:30" },
      5: { open: "6:30", close: "20:00" },
      6: { open: "9:00", close: "20:00" },
    },
  },
];

// Fallback (Jan 1-3, etc.) — same as winter
const DEFAULT_HOURS = {
  0: { open: "9:00", close: "23:30" },
  1: { open: "6:30", close: "23:30" },
  2: { open: "6:30", close: "23:30" },
  3: { open: "6:30", close: "23:30" },
  4: { open: "6:30", close: "23:30" },
  5: { open: "6:30", close: "20:00" },
  6: { open: "9:00", close: "20:00" },
};

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function formatTime12h(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0
    ? `${h12}${suffix}`
    : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function getRecStatus() {
  const now = new Date();
  // Eastern time
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Toronto" }),
  );
  const month = et.getMonth();
  const date = et.getDate();
  const day = et.getDay(); // 0=Sun
  const minutes = et.getHours() * 60 + et.getMinutes();

  // Check holiday / special-date overrides first
  const mmdd = `${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  const override = HOLIDAY_OVERRIDES[mmdd];
  if (mmdd in HOLIDAY_OVERRIDES) {
    // null means fully closed for the day
    if (override === null) {
      return { isOpen: false, todayOpen: null, todayClose: null, holiday: true };
    }
    // Otherwise use the override hours
    const openMin = timeToMinutes(override.open);
    const closeMin = timeToMinutes(override.close);
    return {
      isOpen: minutes >= openMin && minutes < closeMin,
      todayOpen: formatTime12h(override.open),
      todayClose: formatTime12h(override.close),
      holiday: true,
    };
  }

  // Regular seasonal schedule
  const schedule = REC_SCHEDULES.find((s) => s.match(month, date)) || {
    hours: DEFAULT_HOURS,
  };
  const todayHours = schedule.hours[day];

  if (!todayHours) {
    return { isOpen: false, todayOpen: null, todayClose: null };
  }

  const openMin = timeToMinutes(todayHours.open);
  const closeMin = timeToMinutes(todayHours.close);

  return {
    isOpen: minutes >= openMin && minutes < closeMin,
    todayOpen: formatTime12h(todayHours.open),
    todayClose: formatTime12h(todayHours.close),
  };
}

// ── Instagram caption parsing ─────────────────────────────────────────────

// Pattern: "Area Name: 45" or "Area Name: Closed"
const AREA_PATTERNS = [
  { key: "squash", pattern: /squash\s*[:\-–]\s*(\d+|closed)/i },
  { key: "basketball", pattern: /basketball\s*[:\-–]\s*(\d+|closed)/i },
  { key: "volleyball", pattern: /volleyball\s*[:\-–]\s*(\d+|closed)/i },
  { key: "badminton", pattern: /badminton\s*[:\-–]\s*(\d+|closed)/i },
  { key: "futsal", pattern: /futsal\s*[:\-–]\s*(\d+|closed)/i },
  { key: "pickleball", pattern: /pickleball\s*[:\-–]\s*(\d+|closed)/i },
  {
    key: "thirdFloorFitness",
    pattern: /3rd\s*floor\s*fitness\s*centre?\s*[:\-–]\s*(\d+|closed)/i,
  },
  {
    key: "fourthFloorFitness",
    pattern: /4th\s*floor\s*fitness\s*centre?\s*[:\-–]\s*(\d+|closed)/i,
  },
  { key: "cardioMezz", pattern: /cardio\s*mezz\s*[:\-–]\s*(\d+|closed)/i },
  { key: "spin", pattern: /spin\s*[:\-–]\s*(\d+|closed)/i },
  {
    key: "womensOnlyStudio",
    pattern: /women'?s?\s*only\s*studio\s*[:\-–]\s*(\d+|closed)/i,
  },
  { key: "pool", pattern: /pool\s*[:\-–]\s*(\d+|closed)/i },
];

function parseCaption(caption) {
  if (!caption) return null;

  const areas = {};
  let totalOccupancy = 0;
  let foundAny = false;
  let hasOpenArea = false;

  for (const { key, pattern } of AREA_PATTERNS) {
    const match = caption.match(pattern);
    if (match) {
      foundAny = true;
      const val = match[1].toLowerCase();
      if (val === "closed") {
        areas[key] = "Closed";
      } else {
        hasOpenArea = true;
        const num = parseInt(val);
        areas[key] = num;
        totalOccupancy += num;
      }
    }
  }

  if (!foundAny) return null;

  return { areas, totalOccupancy, allClosed: !hasOpenArea };
}

function parseBusynessLevel(total) {
  if (total == null) return "unknown";
  if (total < 100) return "low";
  if (total <= 200) return "moderate";
  return "busy";
}

async function fetchFromApify() {
  if (!APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN environment variable is not set");
  }

  const response = await axios.post(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      directUrls: ["https://www.instagram.com/westernrecuserstats/"],
      resultsType: "posts",
      resultsLimit: 1,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 120000, // 2 min timeout — Apify runs can take a while
    },
  );

  const posts = response.data;
  if (!posts || posts.length === 0) {
    throw new Error("No posts found from @westernrecuserstats");
  }

  const latestPost = posts[0];

  // The actual stats are in the image alt text, not the caption
  const caption =
    latestPost.alt ||
    latestPost.accessibilityCaption ||
    latestPost.caption ||
    latestPost.text ||
    "";

  const timestamp = latestPost.timestamp || latestPost.takenAtTimestamp || null;

  const parsed = parseCaption(caption);

  const areas = parsed?.areas ?? {};
  const totalOccupancy = parsed?.totalOccupancy ?? null;

  // Try to parse timestamp from caption text (e.g., "User Stats April 2, 2026 at 5:00 PM")
  const captionTimeMatch = caption.match(
    /User Stats\s+(.+?\d{1,2}:\d{2}\s*[AP]M)/i,
  );

  let lastUpdated;
  if (captionTimeMatch) {
    const date = new Date(captionTimeMatch[1]);
    lastUpdated = isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  } else if (timestamp) {
    const date =
      typeof timestamp === "string"
        ? new Date(timestamp)
        : new Date(timestamp * 1000);
    lastUpdated = isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  } else {
    lastUpdated = new Date().toISOString();
  }

  // If every scraped area is "Closed", the rec center is closed
  const busynessLevel = parsed?.allClosed
    ? "closed"
    : parseBusynessLevel(totalOccupancy);

  return {
    areas,
    totalOccupancy,
    busynessLevel,
    lastUpdated,
    source: parsed ? "caption" : "unavailable",
  };
}

// Fetch from Apify and store in Redis
async function refreshRecData() {
  try {
    console.log(`[rec] Fetching from Apify at ${new Date().toISOString()}`);
    const data = await fetchFromApify();
    await redis.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify(data));
    console.log(`[rec] Cached successfully — busyness: ${data.busynessLevel}`);
  } catch (error) {
    console.error("[rec] Scheduled fetch failed:", error.message);
  }
}

// Schedule: run at minute 5 of every hour (1:05, 2:05, 3:05, ...)
cron.schedule("5 * * * *", refreshRecData);
// Schedule: run at minute 20 of every hour (1:20, 2:20, 3:20, ...)
cron.schedule("20 * * * *", refreshRecData);
// Also fetch once on startup so there's data immediately
refreshRecData();

// Endpoint reads from Redis, then overlays real-time open/closed from the schedule
router.get("/data", async (req, res) => {
  try {
    const recStatus = getRecStatus();

    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);

      // Override busyness if the rec center is currently closed per schedule
      if (!recStatus.isOpen) {
        data.busynessLevel = "closed";
      }

      data.recHours = {
        open: recStatus.todayOpen,
        close: recStatus.todayClose,
        isOpen: recStatus.isOpen,
      };

      return res.json(data);
    }

    res.json({
      areas: {},
      totalOccupancy: null,
      busynessLevel: recStatus.isOpen ? "unknown" : "closed",
      lastUpdated: null,
      recHours: {
        open: recStatus.todayOpen,
        close: recStatus.todayClose,
        isOpen: recStatus.isOpen,
      },
      message: "Data not yet available — waiting for next scheduled fetch",
    });
  } catch (error) {
    console.error("Rec busyness read error:", error.message);
    res.status(500).json({
      error: "Failed to read rec center data",
      busynessLevel: "unknown",
    });
  }
});

module.exports = router;
