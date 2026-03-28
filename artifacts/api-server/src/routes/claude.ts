import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/claude", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    req.log.error("ANTHROPIC_API_KEY is not set");
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
    return;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...req.body, model: "claude-sonnet-4-5" }),
    });

    const data = await response.json();

    if (!response.ok) {
      req.log.error({ status: response.status, data }, "Anthropic returned error");
      res.status(response.status).json(data);
      return;
    }

    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to proxy Claude request");
    res.status(502).json({ error: "Failed to reach Anthropic API" });
  }
});

export default router;
