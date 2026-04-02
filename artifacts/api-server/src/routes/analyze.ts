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
                text: `Examine this image carefully and choose exactly ONE category from the list below. Use the PRIORITY ORDER when unsure.

CATEGORIES:
- "me" → A single person is the CLEAR MAIN SUBJECT: solo selfie, solo portrait, single person posing. Even if indoors, if a person is the focus → "me".
- "friends" → Two or more people are the CLEAR MAIN SUBJECT: group photo, friends together, couple shot. Even if indoors, if people are the focus → "friends".
- "outfit" → Fashion focused: clothing flat lay, someone modeling clothes/shoes/accessories, OOTD style post. The focus is the clothes/look.
- "food" → Food is the main subject: meal, plate, restaurant dish, dessert, snacks.
- "drinks" → Drinks are the main subject: wine glass, cocktails, beer, coffee. Even if a person holds them, drinks must be the FOCUS.
- "dj" → DJ booth, turntables, CDJs, mixer, concert stage, festival performance setup.
- "vibe" → Pure mood/aesthetic shot: decorative objects, artistic flat lay, candles, abstract textures, bokeh. No clear person or place as subject.
- "city" → Outdoor urban scene: skyscrapers, city skyline, busy city streets with tall buildings from outside. NOT indoor venues.
- "location" → A recognizable PLACE is the main subject, NOT a person: restaurant interior (when empty or architecture is focus), bar/club space as setting, museum interior, cafe interior, landmark building, scenic viewpoint. Use ONLY when the PLACE itself is the subject — NOT when a person is in front of it.
- "outdoor" → Nature or outdoor scenery WITHOUT prominent city buildings: hiking trail, beach, forest, park, mountains, sunset over landscape.
- "night" → Nighttime urban photography: city lights, light trails, neon signs, dark street scenes.
- "pet" → Dog or cat as main subject.
- "animal" → Any other animal (not dog/cat).
- "other" → Anything that does not clearly fit the above.

PRIORITY ORDER:
1. Is a person the clear focus? → me / friends
2. Is fashion/clothing the focus? → outfit
3. Is food the focus? → food
4. Are drinks the focus? → drinks
5. Is a DJ setup visible? → dj
6. Is it an outdoor city scene with skyscrapers? → city
7. Is it a recognizable PLACE (no person focus)? → location
8. Is it nature/outdoor? → outdoor
9. Is it nighttime urban? → night
10. Is it a pet? → pet / animal
11. Pure mood/aesthetic? → vibe
12. None of the above → other

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
