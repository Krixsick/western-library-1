const express = require("express");
const axios = require("axios");
const cron = require("node-cron");
const redis = require("./redis");

const router = express.Router();

const LIBRARY_LIDS = {
  weldon: 3003,
  taylor: 3000,
  music: 2998,
  education: 2996,
  law: 2997,
  business: 2995,
};

const IID = 3436;
const CACHE_KEY = "library:hours";
const CACHE_TTL = 3600;
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatDay(dayData) {
  if (!dayData || !dayData.times) return null;
  const { status, hours } = dayData.times;
  if (status && status !== "open") return null;
  if (!Array.isArray(hours) || hours.length === 0) return null;
  const { from, to } = hours[0];
  if (!from || !to) return null;
  return `${from} – ${to}`;
}

async function fetchLibraryHours(lid) {
  const res = await axios.get(
    "https://api3-ca.libcal.com/api_hours_grid.php",
    {
      params: { iid: IID, lid, format: "json" },
      timeout: 10000,
    },
  );
  const location = res.data && res.data[`loc_${lid}`];
  if (!location || !location.weeks || !location.weeks[0]) return null;

  const week = location.weeks[0];
  const result = {};
  for (const day of DAYS) {
    result[day] = formatDay(week[day]);
  }
  return result;
}

async function fetchAllLibraries() {
  const entries = Object.entries(LIBRARY_LIDS);
  const results = {};
  await Promise.all(
    entries.map(async ([id, lid]) => {
      try {
        results[id] = await fetchLibraryHours(lid);
      } catch (err) {
        console.error(`Failed to fetch ${id}:`, err.message);
        results[id] = null;
      }
    }),
  );
  return results;
}

async function getCached() {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.error("Redis get failed:", err.message);
  }
  return null;
}

async function setCached(data) {
  try {
    await redis.set(CACHE_KEY, JSON.stringify(data), { EX: CACHE_TTL });
  } catch (err) {
    console.error("Redis set failed:", err.message);
  }
}

router.get("/data", async (req, res) => {
  try {
    const cached = await getCached();
    if (cached) return res.json(cached);

    const data = await fetchAllLibraries();
    await setCached(data);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch library hours" });
  }
});

cron.schedule("10 * * * *", async () => {
  try {
    const data = await fetchAllLibraries();
    await setCached(data);
    console.log("[library] cache warmed");
  } catch (err) {
    console.error("[library] scheduled fetch failed:", err.message);
  }
});

module.exports = router;
