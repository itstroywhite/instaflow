import { Router } from "express";

const router = Router();

const VALID_TAGS = [
  "me", "outfit", "food", "dj", "vibe", "friends", "location", "outdoor", "night", "other",
] as const;
type Tag = (typeof VALID_TAGS)[number];

router.post("/analyze", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  const { dataUrl, url } = req.body;

  // Must have either dataUrl (base64) or url (Supabase public URL)
  if (!dataUrl && !url) {
    res.status(400).json({ error: "dataUrl or url is required" });
    return;
  }

  let base64: string;
  let mediaType: string;

  if (url && typeof url === "string" && url.startsWith("http")) {
    // Fetch image from URL and convert to base64
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        req.log.warn({ url, status: imgRes.status }, "Failed to fetch image URL");
        res.json({ tag: "other" });
        return;
      }
      const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
      mediaType = contentType.split(";")[0].trim();
      const arrayBuffer = await imgRes.arrayBuffer();
      base64 = Buffer.from(arrayBuffer).toString("base64");
    } catch (err: any) {
      req.log.warn({ err }, "Error fetching image from URL");
      res.json({ tag: "other" });
      return;
    }
  } else if (dataUrl && typeof dataUrl === "string") {
    const comma = dataUrl.indexOf(",");
    if (comma === -1) {
      res.status(400).json({ error: "Invalid dataUrl format" });
      return;
    }
    const header = dataUrl.slice(0, comma);
    base64 = dataUrl.slice(comma + 1);
    mediaType = header.split(";")[0].replace("data:", "");
  } else {
    res.status(400).json({ error: "Invalid dataUrl or url" });
    return;
  }

  // Only Claude-supported image types
  const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!supportedTypes.includes(mediaType)) {
    req.log.info({ mediaType }, "Unsupported media type, tagging as other");
    res.json({ tag: "other" });
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
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 20,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text: `Examine this image carefully and choose exactly ONE category from the list below. Read each definition closely before choosing.

CATEGORIES:
- "me" → A single person who appears to be the subject/subject-of-focus: solo selfie, solo portrait, single person posing alone, mirror pic alone. NOT multiple people.
- "friends" → Two or more people together: group photo, friends hanging out, social gathering, couple shot, people at a party together.
- "outfit" → Fashion-focused: clothing flat lay, someone modeling clothes/shoes/accessories, OOTD style post. The focus is the clothes/look, not the person.
- "food" → Food or beverages are the main subject: meal, coffee, drinks, restaurant plate, dessert, cocktails, snacks. Even if a person is holding it, food is the focus.
- "dj" → DJ or music performance context: DJ booth, turntables, CDJs, mixer, concert stage, festival performance setup, crowd at a music event.
- "vibe" → Mood/aesthetic shot with no clear subject: decorative objects, aesthetic flat lay, candles, bottles arranged artfully, artistic blur, bokeh, abstract textures.
- "location" → A recognizable landmark or iconic place: famous building, monument, skyline, tourist attraction, city view. No prominent person in foreground.
- "outdoor" → Nature or outdoor scenery without a prominent person: hiking trail, beach, forest, park, mountains, sunset/sunrise over landscape, garden.
- "night" → Nighttime urban photography: city lights at night, light trails, neon signs, dark street scene, nightclub exterior, starry sky.
- "other" → Anything that does not clearly fit the above.

Reply with ONLY the single category word in lowercase, nothing else.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    req.log.info({ status: response.status, data }, "Claude analyze raw response");

    if (!response.ok) {
      req.log.error({ data }, "Anthropic error during analysis");
      res.json({ tag: "other", error: data?.error?.message });
      return;
    }

    const rawText: string = data.content?.[0]?.text ?? "";
    const cleaned = rawText.toLowerCase().trim().replace(/[^a-z]/g, "");
    req.log.info({ rawText, cleaned }, "Claude analyze parsed");

    const tag: Tag = VALID_TAGS.includes(cleaned as Tag) ? (cleaned as Tag) : "other";
    res.json({ tag });
  } catch (err: any) {
    req.log.error({ err }, "Failed to call Claude for analysis");
    res.status(502).json({ tag: "other", error: "Failed to reach Anthropic API" });
  }
});

export default router;
