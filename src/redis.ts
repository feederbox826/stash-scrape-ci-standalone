import { createClient } from "@redis/client";

export const client = await createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
})
  .on("error", (err) => {})
  .connect()
