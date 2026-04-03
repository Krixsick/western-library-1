const express = require("express");
const axios = require("axios");
const cron = require("node-cron");
const redis = require("./redis");

const router = express.Router();

const CACHE_KEY = "rec:busyness";
const CACHE_TTL = 7200; // 2 hours in seconds (generous buffer between hourly fetches)

const APIFY_TOKEN = process.env.APIFY_TOKEN;

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

  for (const { key, pattern } of AREA_PATTERNS) {
    const match = caption.match(pattern);
    if (match) {
      foundAny = true;
      const val = match[1].toLowerCase();
      if (val === "closed") {
        areas[key] = "Closed";
      } else {
        const num = parseInt(val);
        areas[key] = num;
        totalOccupancy += num;
      }
    }
  }

  if (!foundAny) return null;

  return { areas, totalOccupancy };
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
  // console.log("[rec] Apify post keys:", Object.keys(latestPost));

  // The actual stats are in the image alt text, not the caption
  const caption =
    latestPost.alt ||
    latestPost.accessibilityCaption ||
    latestPost.caption ||
    latestPost.text ||
    "";
  // console.log("[rec] Caption text:", caption.substring(0, 300));

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

  return {
    areas,
    totalOccupancy,
    busynessLevel: parseBusynessLevel(totalOccupancy),
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

// Also fetch once on startup so there's data immediately
refreshRecData();

// Endpoint just reads from Redis — no Apify calls
router.get("/data", async (req, res) => {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    res.json({
      areas: {},
      totalOccupancy: null,
      busynessLevel: "unknown",
      lastUpdated: null,
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
