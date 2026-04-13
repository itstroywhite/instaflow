import { Router } from "express";

const router = Router();

const VALID_TAGS = [
  "me","friends","pet","animal","food","drinks","outfit","gym","dj","party","city","location","outdoor","night","vibe","other",
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
                text: `TAGS (ONLY ONE TAG PER IMAGE)

PRIORITY ORDER (TOP = HIGHEST PRIORITY):
1. me
2. friends
3. pet
4. animal
5. food
6. drinks
7. outfit
8. gym
9. dj
10. party
11. city
12. location
13. outdoor
14. night
15. vibe
16. other

RULES:
1. ALWAYS ASSIGN EXACTLY ONE TAG.
2. IF MULTIPLE CONDITIONS MATCH → CHOOSE THE TAG WITH HIGHER PRIORITY.
3. DO NOT COMBINE TAGS.

TAG DEFINITIONS:
me: Main person is dominant subject (>50% of image focus). Solo person, selfie, portrait.
friends: 2 or more people visible with no single dominant person.
pet: Domesticated animal (dog, cat, rabbit, etc.) is main subject.
animal: Non-domesticated or unclear animal is main subject.
food: Food is main focus (≥40% of image). Not primarily drinks.
drinks: Beverage is main focus (glass, bottle, cup, cocktail, wine).
outfit: Clothing is main focus (full body shot, mirror photo, styling post). NOT a group image.
gym: Gym environment OR workout activity clearly visible.
dj: DJ equipment (turntables, CDJs, mixer) visible AND person actively performing/behind the decks. This tag takes priority over "me" when DJ setup is clearly present with a person performing.
party: Crowd + party atmosphere (lights, club, event). No clear DJ focus.
city: Urban environment (skyline, streets, buildings, architecture).
location: Place/environment is main subject (indoor or outdoor). No strong person or object subject.
outdoor: Image taken outside. No higher priority tag applies.
night: Night or dark environment. No higher priority tag applies.
vibe: No clear subject. Only mood or atmosphere detectable.
other: No category matches.

CONFLICT RULES:
- me > friends
- friends > party
- dj > me (when DJ setup clearly visible with performer)
- dj > party
- pet > animal
- food vs drinks → choose more visually dominant
- gym > outfit
- me > outfit

VALID TAGS: ["me","friends","pet","animal","food","drinks","outfit","gym","dj","party","city","location","outdoor","night","vibe","other"]

Reply with ONLY the single tag word in lowercase. Nothing else.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json() as any;
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
