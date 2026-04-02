import { Router } from "express";

const router = Router();

const VALID_TAGS = [
  "me", "outfit", "food", "drinks", "dj", "vibe", "friends", "location", "city", "outdoor", "night", "pet", "animal", "other",
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
                text: `Examine this image carefully and choose exactly ONE category. Follow the STRICT RULES below — do not deviate.

ABSOLUTE RULE — CHECK THIS FIRST:
Is ANY person clearly visible as a subject in this image (selfie, portrait, mirror pic, someone posing, standing, sitting, looking at camera, or otherwise the focus)?
- YES, exactly 1 person → ALWAYS tag "me". No exceptions. Even if indoors, at a restaurant, at a landmark, at night, holding food/drinks — if a person is the subject, it is "me".
- YES, 2 or more people → ALWAYS tag "friends". No exceptions. Even if indoors, at a party, at a venue.
- NO person as subject → continue to the categories below.

CATEGORIES (only used when NO person is the subject):
- "outfit" → Fashion focused: clothing flat lay or closeup of clothes/shoes/accessories with no person as focus.
- "food" → Food is the ONLY subject: meal, plate, dessert, snacks. No person visible.
- "drinks" → Drinks are the ONLY subject: wine, cocktails, beer, coffee. No person visible.
- "dj" → DJ equipment: turntables, CDJs, mixer. No person as focus.
- "city" → Outdoor urban scene: skyscrapers, city skyline, busy streets with tall buildings. No person as subject. NOT indoor.
- "location" → A recognizable interior PLACE as subject: restaurant interior, bar/club space, museum, cafe, landmark building. No person as subject.
- "outdoor" → Nature or outdoor scenery: hiking trail, beach, forest, park, mountains, landscape. No city buildings. No person.
- "night" → Nighttime urban: city lights, neon signs, dark streets. No person as subject.
- "pet" → Dog or cat as main subject. No person as subject.
- "animal" → Any other animal. No person as subject.
- "vibe" → Pure mood/aesthetic: decorative objects, candles, abstract textures, bokeh. Nothing else fits.
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
