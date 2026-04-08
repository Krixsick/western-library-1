const { createClient } = require("redis");

const client = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
    keepAlive: 30000,
  },
});

client.on("error", (err) => console.error("Redis error:", err.message));
client.connect();

module.exports = client;
