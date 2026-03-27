/**
 * InstaFlow — Standalone Railway Server
 * Single-file Express server with all API routes.
 * Run with: node railway-server.js
 * Requires env vars: DATABASE_URL, ANTHROPIC_API_KEY
 */

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Database ────────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tag TEXT,
      data_url TEXT NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approved_posts (
      id TEXT PRIMARY KEY,
      day TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      tags_summary TEXT NOT NULL DEFAULT '',
      slide_count TEXT NOT NULL DEFAULT '1',
      scheduled_date TEXT,
      scheduled_time TEXT,
      media_ids TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS scheduled_date TEXT;
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS scheduled_time TEXT;
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS media_ids TEXT;
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

    CREATE TABLE IF NOT EXISTS media_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      media_ids TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

let tablesReady = false;
async function withTables(fn, res) {
  try {
    if (!tablesReady) { await ensureTables(); tablesReady = true; }
    await fn();
  } catch (err) {
    console.error("DB error:", err?.message);
    res.status(500).json({ error: err?.message ?? "Database error" });
  }
}

// ── In-memory cache ─────────────────────────────────────────────────────────

let mediaCache = null;
let postsCache = null;
let settingsCache = null;
let foldersCache = null;

function invalidateMedia() { mediaCache = null; }
function invalidatePosts() { postsCache = null; }
function invalidateSettings() { settingsCache = null; }
function invalidateFolders() { foldersCache = null; }

const PAGE_SIZE = 20;

// ── Health ───────────────────────────────────────────────────────────────────

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Media ────────────────────────────────────────────────────────────────────

app.get("/api/media", async (req, res) => {
  await withTables(async () => {
    if (!mediaCache) {
      const result = await pool.query(
        "SELECT id, name, tag, data_url, used, created_at FROM media_items WHERE data_url NOT LIKE 'data:video/%' ORDER BY created_at DESC"
      );
      mediaCache = result.rows.map((r) => ({
        id: r.id, name: r.name, tag: r.tag, dataUrl: r.data_url,
        used: r.used ?? false, createdAt: r.created_at,
      }));
    }
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const offset = (page - 1) * PAGE_SIZE;
    const items = mediaCache.slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < mediaCache.length;
    const total = mediaCache.length;
    res.json({ items, hasMore, total, page });
  }, res);
});

app.post("/api/media", async (req, res) => {
  const { id, name, tag, dataUrl, used } = req.body;
  if (typeof dataUrl === "string" && dataUrl.startsWith("data:video/")) {
    return res.status(400).json({ error: "VIDEO_NOT_SUPPORTED" });
  }
  await withTables(async () => {
    await pool.query(
      "INSERT INTO media_items (id, name, tag, data_url, used) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
      [id, name, tag ?? null, dataUrl, used ?? false]
    );
    invalidateMedia();
    res.json({ ok: true });
  }, res);
});

app.patch("/api/media/:id", async (req, res) => {
  const { tag, used } = req.body;
  await withTables(async () => {
    if (tag !== undefined && used !== undefined) {
      await pool.query("UPDATE media_items SET tag = $1, used = $2 WHERE id = $3", [tag, used, req.params.id]);
    } else if (tag !== undefined) {
      await pool.query("UPDATE media_items SET tag = $1 WHERE id = $2", [tag, req.params.id]);
    } else if (used !== undefined) {
      await pool.query("UPDATE media_items SET used = $1 WHERE id = $2", [used, req.params.id]);
    }
    invalidateMedia();
    res.json({ ok: true });
  }, res);
});

app.delete("/api/media/:id", async (req, res) => {
  await withTables(async () => {
    await pool.query("DELETE FROM media_items WHERE id = $1", [req.params.id]);
    invalidateMedia();
    res.json({ ok: true });
  }, res);
});

// ── Settings ─────────────────────────────────────────────────────────────────

app.get("/api/settings", async (req, res) => {
  await withTables(async () => {
    if (settingsCache) { res.json(settingsCache); return; }
    const result = await pool.query("SELECT key, value FROM app_settings");
    const settings = {};
    for (const row of result.rows) settings[row.key] = row.value;
    settingsCache = settings;
    res.json(settings);
  }, res);
});

app.put("/api/settings/:key", async (req, res) => {
  const { value } = req.body;
  await withTables(async () => {
    await pool.query(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
      [req.params.key, value]
    );
    invalidateSettings();
    res.json({ ok: true });
  }, res);
});

// ── Posts & Drafts ────────────────────────────────────────────────────────────

app.get("/api/posts", async (req, res) => {
  await withTables(async () => {
    if (postsCache) { res.json(postsCache); return; }
    const result = await pool.query(
      "SELECT id, day, caption, tags_summary, slide_count, scheduled_date, scheduled_time, media_ids, status, created_at FROM approved_posts ORDER BY created_at DESC"
    );
    postsCache = result.rows.map((r) => ({
      id: r.id, day: r.day, caption: r.caption, tagsSummary: r.tags_summary,
      slideCount: parseInt(r.slide_count, 10),
      scheduledDate: r.scheduled_date ?? null,
      scheduledTime: r.scheduled_time ?? null,
      mediaIds: r.media_ids ? JSON.parse(r.media_ids) : [],
      status: r.status ?? "approved",
      createdAt: r.created_at,
    }));
    res.json(postsCache);
  }, res);
});

app.post("/api/posts", async (req, res) => {
  const { id, day, caption, tagsSummary, slideCount, scheduledDate, scheduledTime, mediaIds, status } = req.body;
  await withTables(async () => {
    await pool.query(
      `INSERT INTO approved_posts (id, day, caption, tags_summary, slide_count, scheduled_date, scheduled_time, media_ids, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         day = EXCLUDED.day, caption = EXCLUDED.caption, tags_summary = EXCLUDED.tags_summary,
         slide_count = EXCLUDED.slide_count, scheduled_date = EXCLUDED.scheduled_date,
         scheduled_time = EXCLUDED.scheduled_time, media_ids = EXCLUDED.media_ids,
         status = EXCLUDED.status`,
      [id, day, caption ?? "", tagsSummary ?? "", String(slideCount ?? 1),
       scheduledDate ?? null, scheduledTime ?? null,
       mediaIds ? JSON.stringify(mediaIds) : null,
       status ?? "approved"]
    );
    invalidatePosts();
    res.json({ ok: true });
  }, res);
});

app.delete("/api/posts/:id", async (req, res) => {
  await withTables(async () => {
    await pool.query("DELETE FROM approved_posts WHERE id = $1", [req.params.id]);
    invalidatePosts();
    res.json({ ok: true });
  }, res);
});

// ── Folders ───────────────────────────────────────────────────────────────────

app.get("/api/folders", async (req, res) => {
  await withTables(async () => {
    if (foldersCache) { res.json(foldersCache); return; }
    const result = await pool.query(
      "SELECT id, name, media_ids, created_at FROM media_folders ORDER BY created_at ASC"
    );
    foldersCache = result.rows.map((r) => ({
      id: r.id, name: r.name,
      mediaIds: r.media_ids ? JSON.parse(r.media_ids) : [],
      createdAt: r.created_at,
    }));
    res.json(foldersCache);
  }, res);
});

app.post("/api/folders", async (req, res) => {
  const { id, name, mediaIds } = req.body;
  await withTables(async () => {
    await pool.query(
      "INSERT INTO media_folders (id, name, media_ids) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
      [id, name, mediaIds ? JSON.stringify(mediaIds) : "[]"]
    );
    invalidateFolders();
    res.json({ ok: true });
  }, res);
});

app.patch("/api/folders/:id", async (req, res) => {
  const { name, mediaIds } = req.body;
  await withTables(async () => {
    if (name !== undefined && mediaIds !== undefined) {
      await pool.query("UPDATE media_folders SET name = $1, media_ids = $2 WHERE id = $3",
        [name, JSON.stringify(mediaIds), req.params.id]);
    } else if (name !== undefined) {
      await pool.query("UPDATE media_folders SET name = $1 WHERE id = $2", [name, req.params.id]);
    } else if (mediaIds !== undefined) {
      await pool.query("UPDATE media_folders SET media_ids = $1 WHERE id = $2",
        [JSON.stringify(mediaIds), req.params.id]);
    }
    invalidateFolders();
    res.json({ ok: true });
  }, res);
});

app.delete("/api/folders/:id", async (req, res) => {
  await withTables(async () => {
    await pool.query("DELETE FROM media_folders WHERE id = $1", [req.params.id]);
    invalidateFolders();
    res.json({ ok: true });
  }, res);
});

// ── AI — Claude Proxy ─────────────────────────────────────────────────────────

app.post("/api/claude", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    console.error("Claude proxy error:", err);
    res.status(502).json({ error: "Failed to reach Anthropic API" });
  }
});

// ── AI — Image Auto-Tag ───────────────────────────────────────────────────────

const VALID_TAGS = ["me", "outfit", "food", "dj", "vibe", "friends", "location", "outdoor", "night", "other"];

app.post("/api/analyze", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }
  const { dataUrl } = req.body;
  if (!dataUrl || typeof dataUrl !== "string") {
    return res.status(400).json({ error: "dataUrl is required" });
  }
  const comma = dataUrl.indexOf(",");
  if (comma === -1) {
    return res.status(400).json({ error: "Invalid dataUrl format" });
  }
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mediaType = header.split(";")[0].replace("data:", "");
  const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!supportedTypes.includes(mediaType)) {
    return res.json({ tag: "other" });
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
        model: "claude-haiku-4-5",
        max_tokens: 20,
        messages: [{
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
        }],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.json({ tag: "other", error: data?.error?.message });
    }
    const rawText = data.content?.[0]?.text ?? "";
    const cleaned = rawText.toLowerCase().trim().replace(/[^a-z]/g, "");
    const tag = VALID_TAGS.includes(cleaned) ? cleaned : "other";
    res.json({ tag });
  } catch (err) {
    console.error("Analyze error:", err);
    res.status(502).json({ tag: "other", error: "Failed to reach Anthropic API" });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`InstaFlow API server running on port ${PORT}`);
});
