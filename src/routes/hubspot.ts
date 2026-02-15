import { Hono } from "hono";

export const hubspotWebhook = new Hono();

hubspotWebhook.post("/", async (c) => {
  return c.json({ status: "ok", message: "not implemented" });
});
