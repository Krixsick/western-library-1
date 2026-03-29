const express = require("express");
const cors = require("cors");
const app = express();
const libraryRouter = require("./libraryTime");

app.use(cors());
app.use("/api/library", libraryRouter);

app.get("/", (req, res) => {
  res.send("hello");
});

app.listen(3001, () => console.log("Scraper API running on port 3001"));
