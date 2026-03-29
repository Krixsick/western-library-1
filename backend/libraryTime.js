const express = require("express");
const puppeteer = require("puppeteer");

const router = express.Router();

const LIBRARY_PAGES = {
  archives: "https://www.lib.uwo.ca/hours/archives/index.html",
  weldon: "https://www.lib.uwo.ca/hours/weldon/index.html",
  taylor: "https://www.lib.uwo.ca/hours/taylor/index.html",
  music: "https://www.lib.uwo.ca/hours/music/index.html",
  education: "https://www.lib.uwo.ca/hours/education/index.html",
  law: "https://www.lib.uwo.ca/hours/law/index.html",
  business: "https://www.lib.uwo.ca/hours/business/index.html",
};

async function scrapeLibraryHours(browser, url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  await page.waitForSelector(".s-lc-whw", { timeout: 15000 });

  const hours = await page.evaluate(() => {
    const result = {};

    const headers = document.querySelectorAll(".s-lc-whw thead th");
    const days = [];
    headers.forEach((th) => {
      const text = th.textContent.trim();
      const dayMatch = text.match(
        /(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/,
      );
      if (dayMatch) days.push(dayMatch[1]);
    });

    const mainRow = document.querySelector("tr.s-lc-whw-loc");
    if (!mainRow) return result;

    const cells = mainRow.querySelectorAll("td");
    let dayIndex = 0;
    cells.forEach((td, i) => {
      if (i === 0) return;
      if (dayIndex >= days.length) return;

      const closed = td.querySelector(".s-lc-closed");
      const timeSpan = td.querySelector(".s-lc-time");

      if (closed) {
        result[days[dayIndex]] = null;
      } else if (timeSpan) {
        result[days[dayIndex]] = timeSpan.textContent.trim();
      }
      dayIndex++;
    });

    return result;
  });

  await page.close();
  return hours;
}

router.get("/data", async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new" });
    const results = {};

    for (const [id, url] of Object.entries(LIBRARY_PAGES)) {
      try {
        results[id] = await scrapeLibraryHours(browser, url);
      } catch (err) {
        console.error(`Failed to scrape ${id}:`, err.message);
        results[id] = null;
      }
    }

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to scrape hours" });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
