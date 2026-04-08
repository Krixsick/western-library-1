require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const libraryRouter = require("./libraryTime");
const recRouter = require("./recBusyness");
const diningRouter = require("./diningHours");

// Allow a comma-separated list of origins, falling back to localhost dev URLs
const allowedOrigins = (
  process.env.FRONTEND_ORIGIN ||
  "http://localhost:5173,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  }),
);

app.use("/api/library", libraryRouter);
app.use("/api/rec", recRouter);
app.use("/api/dining", diningRouter);

app.get("/", (req, res) => {
  res.send("hello");
});

// Health check endpoint for App Runner
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Scraper API running on port ${PORT}`));
