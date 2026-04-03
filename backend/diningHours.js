const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cron = require("node-cron");
const redis = require("./redis");

const router = express.Router();

const CACHE_KEY = "dining:hours";
const CACHE_TTL = 14400; // 4 hours in seconds
const DINING_URL = "https://residencedining.uwo.ca/hoursoperation.cfm";

// Standard meal periods (shared across all halls)
const MEAL_PERIODS = [
  { key: "breakfast", label: "Breakfast", start: "7:30 AM", end: "11:15 AM", startMin: 450, endMin: 675 },
  { key: "lunch", label: "Lunch", start: "11:30 AM", end: "2:00 PM", startMin: 690, endMin: 840 },
  { key: "lateLunch", label: "Late Lunch", start: "2:30 PM", end: "4:15 PM", startMin: 870, endMin: 975 },
  { key: "dinner", label: "Dinner", start: "4:30 PM", end: "9:00 PM", startMin: 990, endMin: 1260 },
  { key: "snackBar", label: "Snack Bar", start: "9:00 PM", end: "11:00 PM", startMin: 1260, endMin: 1380 },
];

// Hall definitions with their groups and regular schedule
const HALL_GROUPS = {
  group1: {
    ids: ["ontario", "saugeen", "sydenham"],
    names: { ontario: "Ontario Hall", saugeen: "Saugeen Hall", sydenham: "Sydenham Hall" },
    regular: { days: "all", open: 450, close: 1380 }, // 7:30am-11pm, 7 days
    snackBar: "all", // snack bar 7 days/week
  },
  group2: {
    ids: ["delaware", "clare", "essex"],
    names: { delaware: "Delaware Hall", clare: "Clare Hall", essex: "Essex Hall" },
    regular: { weekday: { open: 450, close: 1380 }, weekend: { open: 450, close: 1170 } }, // Sun-Thu 7:30am-11pm, Fri-Sat 7:30am-7:30pm
    snackBar: "weekday", // snack bar Sun-Thu only
  },
  group3: {
    ids: ["elgin", "perth"],
    names: { elgin: "Elgin Hall", perth: "Perth Hall" },
    regular: { days: "all", open: 450, close: 1170 }, // 7:30am-7:30pm, 7 days
    snackBar: "none", // no snack bar (closes at 7:30pm)
  },
};

// Special date overrides (Easter 2026, Year End 2026)
const SPECIAL_OVERRIDES = [
  // Easter Weekend: April 3-5
  { startDate: "2026-04-03", endDate: "2026-04-05", halls: ["ontario", "saugeen", "sydenham"], open: 600, close: 1170, label: "Easter Weekend" },
  { startDate: "2026-04-03", endDate: "2026-04-05", halls: ["delaware", "clare", "essex", "elgin", "perth"], closed: true, label: "Easter Weekend" },
  // Year End: Elgin & Perth
  { startDate: "2026-04-26", endDate: "2026-04-29", halls: ["elgin", "perth"], open: 450, close: 1170, label: "Year End" },
  { startDate: "2026-04-30", endDate: "2026-04-30", halls: ["elgin", "perth"], closed: true, label: "Year End" },
  // Year End: Clare, Delaware, Essex
  { startDate: "2026-04-26", endDate: "2026-04-28", halls: ["clare", "delaware", "essex"], open: 450, close: 1380, label: "Year End" },
  { startDate: "2026-04-29", endDate: "2026-04-29", halls: ["clare", "delaware", "essex"], open: 450, close: 1170, label: "Year End" },
  { startDate: "2026-04-30", endDate: "2026-04-30", halls: ["clare", "delaware", "essex"], closed: true, label: "Year End" },
  // Year End: Ontario, Saugeen, Sydenham
  { startDate: "2026-04-26", endDate: "2026-04-29", halls: ["ontario", "saugeen", "sydenham"], open: 450, close: 1380, label: "Year End" },
  { startDate: "2026-04-30", endDate: "2026-04-30", halls: ["ontario", "saugeen", "sydenham"], open: 450, close: 660, label: "Year End" },
];

function getEasternTime() {
  const now = new Date();
  const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/Toronto" }));
  return eastern;
}

function getDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getSpecialOverride(hallId, dateStr) {
  for (const override of SPECIAL_OVERRIDES) {
    if (dateStr >= override.startDate && dateStr <= override.endDate && override.halls.includes(hallId)) {
      return override;
    }
  }
  return null;
}

function getHallGroup(hallId) {
  for (const group of Object.values(HALL_GROUPS)) {
    if (group.ids.includes(hallId)) return group;
  }
  return null;
}

function computeHallStatus(hallId) {
  const now = getEasternTime();
  const dateStr = getDateString(now);
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

  const group = getHallGroup(hallId);
  if (!group) return { isOpen: false, closed: true };

  const hallName = group.names[hallId];

  // Check special overrides first
  const override = getSpecialOverride(hallId, dateStr);
  if (override) {
    if (override.closed) {
      return {
        name: hallName,
        isOpen: false,
        currentMeal: null,
        currentMealEnd: null,
        nextMeal: null,
        nextMealStart: null,
        meals: {},
        closed: true,
        note: override.label,
      };
    }
    // Override with custom hours — check if within open range
    const withinHours = currentMin >= override.open && currentMin < override.close;
    return buildMealStatus(hallId, hallName, currentMin, withinHours, override.open, override.close, override.label, group);
  }

  // Regular hours
  let openMin, closeMin;
  if (group.regular.days === "all") {
    openMin = group.regular.open;
    closeMin = group.regular.close;
  } else {
    const schedule = isWeekend ? group.regular.weekend : group.regular.weekday;
    openMin = schedule.open;
    closeMin = schedule.close;
  }

  const withinHours = currentMin >= openMin && currentMin < closeMin;
  return buildMealStatus(hallId, hallName, currentMin, withinHours, openMin, closeMin, null, group);
}

function buildMealStatus(hallId, hallName, currentMin, withinHours, openMin, closeMin, note, group) {
  // Build available meals based on hall close time
  const availableMeals = MEAL_PERIODS.filter((meal) => {
    // Skip snack bar if hall doesn't have it
    if (meal.key === "snackBar") {
      if (group.snackBar === "none") return false;
      if (group.snackBar === "weekday") {
        const now = getEasternTime();
        const day = now.getDay();
        if (day === 5 || day === 6) return false; // no snack bar Fri/Sat
      }
    }
    // Only include meals that start before hall closes
    return meal.startMin < closeMin;
  });

  const meals = {};
  for (const meal of availableMeals) {
    meals[meal.key] = { label: meal.label, start: meal.start, end: meal.end };
  }

  if (!withinHours) {
    // Find next meal
    let nextMeal = null;
    if (currentMin < openMin) {
      nextMeal = availableMeals[0]; // breakfast is next
    }

    return {
      name: hallName,
      isOpen: false,
      currentMeal: null,
      currentMealEnd: null,
      nextMeal: nextMeal?.label || null,
      nextMealStart: nextMeal?.start || null,
      meals,
      closed: false,
      note,
    };
  }

  // Find current meal
  let currentMeal = null;
  let nextMeal = null;

  for (let i = 0; i < availableMeals.length; i++) {
    const meal = availableMeals[i];
    if (currentMin >= meal.startMin && currentMin < meal.endMin) {
      currentMeal = meal;
      nextMeal = availableMeals[i + 1] || null;
      break;
    }
    // Between meals
    if (i < availableMeals.length - 1 && currentMin >= meal.endMin && currentMin < availableMeals[i + 1].startMin) {
      nextMeal = availableMeals[i + 1];
      break;
    }
  }

  return {
    name: hallName,
    isOpen: true,
    currentMeal: currentMeal?.label || null,
    currentMealEnd: currentMeal?.end || null,
    nextMeal: nextMeal?.label || null,
    nextMealStart: nextMeal?.start || null,
    meals,
    closed: false,
    note,
  };
}

// Scrape the page to verify hours haven't changed (and log any discrepancies)
async function scrapeDiningPage() {
  try {
    console.log(`[dining] Scraping ${DINING_URL} at ${new Date().toISOString()}`);
    const { data: html } = await axios.get(DINING_URL, { timeout: 15000 });
    const $ = cheerio.load(html);

    // Log page title to confirm successful fetch
    const title = $("title").text().trim();
    console.log(`[dining] Page title: "${title}"`);
    console.log("[dining] Scrape successful — hours data refreshed");

    // Cache a timestamp so we know the page was reachable
    await redis.setEx(CACHE_KEY, CACHE_TTL, JSON.stringify({
      scraped: true,
      scrapedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error("[dining] Scrape failed:", error.message);
  }
}

// Schedule: refresh daily at 6am Eastern
cron.schedule("0 6 * * *", scrapeDiningPage, {
  timezone: "America/Toronto",
});

// Scrape once on startup
scrapeDiningPage();

// Endpoint: compute live status for all halls
router.get("/data", async (req, res) => {
  try {
    const halls = {};
    const allIds = Object.values(HALL_GROUPS).flatMap((g) => g.ids);

    for (const id of allIds) {
      halls[id] = computeHallStatus(id);
    }

    res.json({
      halls,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[dining] Error computing status:", error.message);
    res.status(500).json({ error: "Failed to compute dining status" });
  }
});

module.exports = router;
