require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const libraryRouter = require("./libraryTime");
const recRouter = require("./recBusyness");
const diningRouter = require("./diningHours");

app.use(cors());
app.use("/api/library", libraryRouter);
app.use("/api/rec", recRouter);
app.use("/api/dining", diningRouter);

app.get("/", (req, res) => {
  res.send("hello");
});

app.listen(3001, () => console.log("Scraper API running on port 3001"));
