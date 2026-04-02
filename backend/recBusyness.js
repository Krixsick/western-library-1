const express = require("express");
const axios = require("axios");

const router = express.Router();

// In-memory cache
let cache = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const APIFY_TOKEN = process.env.APIFY_TOKEN;

function parseBusynessLevel(total) {
  if (total == null) return "unknown";
  if (total < 40) return "low";
  if (total <= 80) return "moderate";
  return "busy";
}

function parseCaption(caption) {
  if (!caption) return null;

  const result = {};

  // Try common patterns like "Weight Room: 45" or "Weight Room - 45" or "Weight Room 45"
  const patterns = [
    /weight\s*room\s*[:\-–]\s*(\d+)/i,
    /cardio\s*(?:mezzanine)?\s*[:\-–]\s*(\d+)/i,
    /spin\s*(?:room|studio)?\s*[:\-–]\s*(\d+)/i,
  ];

  const keys = ["weightRoom", "cardioMezzanine", "spinRoom"];

  patterns.forEach((pattern, i) => {
    const match = caption.match(pattern);
    if (match) {
      result[keys[i]] = parseInt(match[1]);
    }
  });

  // Also try to find a total/occupancy number
  const totalMatch = caption.match(/total\s*[:\-–]\s*(\d+)/i);
  if (totalMatch) {
    result.total = parseInt(totalMatch[1]);
  }

  // If we found at least one area, return
  if (Object.keys(result).length > 0) {
    return result;
  }

  // Fallback: try to find any numbers in the caption
  const numbers = caption.match(/\d+/g);
  if (numbers && numbers.length >= 1) {
    return { rawNumbers: numbers.map(Number) };
  }

  return null;
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
  const caption = latestPost.caption || latestPost.text || "";
  const timestamp = latestPost.timestamp || latestPost.takenAtTimestamp || null;

  const parsed = parseCaption(caption);

  const weightRoom = parsed?.weightRoom ?? null;
  const cardioMezzanine = parsed?.cardioMezzanine ?? null;
  const spinRoom = parsed?.spinRoom ?? null;

  let totalOccupancy = parsed?.total ?? null;
  if (totalOccupancy == null && weightRoom != null) {
    totalOccupancy =
      (weightRoom || 0) + (cardioMezzanine || 0) + (spinRoom || 0);
  }

  return {
    weightRoom,
    cardioMezzanine,
    spinRoom,
    totalOccupancy,
    busynessLevel: parseBusynessLevel(totalOccupancy),
    lastUpdated: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString(),
    caption: caption.substring(0, 200),
    source: parsed ? "caption" : "unavailable",
  };
}

router.get("/data", async (req, res) => {
  try {
    const now = Date.now();

    // Return cached data if still fresh
    if (cache.data && now - cache.timestamp < CACHE_TTL) {
      return res.json(cache.data);
    }

    const data = await fetchFromApify();

    // Update cache
    cache = { data, timestamp: now };

    res.json(data);
  } catch (error) {
    console.error("Rec busyness fetch error:", error.message);

    // Return stale cache if available
    if (cache.data) {
      return res.json({ ...cache.data, stale: true });
    }

    res.status(500).json({
      error: "Failed to fetch rec center data",
      busynessLevel: "unknown",
      weightRoom: null,
      cardioMezzanine: null,
      spinRoom: null,
      totalOccupancy: null,
      lastUpdated: null,
    });
  }
});

module.exports = router;
