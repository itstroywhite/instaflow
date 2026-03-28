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

// CORS — allow all origins so the Vercel frontend can talk to this Render backend.
// To lock it down to a specific origin, set ALLOWED_ORIGIN env var.
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.options("*", cors()); // Handle pre-flight for all routes
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Database ────────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

// Use SSL in production (required by Render PostgreSQL and most managed DBs).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
});

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tag TEXT,
      data_url TEXT,
      url TEXT,
      folder_id TEXT,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS url TEXT;
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS folder_id TEXT;

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
    // Reset tablesReady on connection errors so the next request retries
    if (err?.code === "ECONNREFUSED" || err?.code === "ECONNRESET" || err?.code === "57P03") {
      tablesReady = false;
    }
    console.error("[DB error] code:", err?.code, "msg:", err?.message);
    if (!res.headersSent) res.status(500).json({ error: err?.message ?? "Database error" });
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
        `SELECT id, name, tag, url, folder_id, used, created_at
         FROM media_items
         ORDER BY created_at DESC`
      );
      mediaCache = result.rows.map((r) => ({
        id: r.id, name: r.name, tag: r.tag,
        dataUrl: r.url ?? "",
        folderId: r.folder_id ?? null,
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

// POST /api/media/upload — upload to Supabase Storage + save DB record in one call
app.post("/api/media/upload", async (req, res) => {
  const { id, name, dataUrl, tag, folderId } = req.body;
  if (!id || !name || !dataUrl) {
    return res.status(400).json({ error: "id, name, and dataUrl are required" });
  }
  if (typeof dataUrl === "string" && dataUrl.startsWith("data:video/")) {
    return res.status(400).json({ error: "VIDEO_NOT_SUPPORTED" });
  }

  const comma = dataUrl.indexOf(",");
  if (comma === -1) return res.status(400).json({ error: "Invalid dataUrl format" });
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mediaType = header.split(";")[0].replace("data:", "") || "image/jpeg";
  const ext = mediaType.split("/")[1]?.split("+")[0] || "jpg";
  const filename = `${id}-${Date.now()}.${ext}`;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  let publicUrl = null;
  if (supabaseUrl && supabaseKey) {
    try {
      const buffer = Buffer.from(base64, "base64");
      console.log(`[media/upload] Uploading ${filename} (${buffer.length} bytes)`);
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/media/${filename}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${supabaseKey}`, "Content-Type": mediaType, "x-upsert": "true" },
        body: buffer,
      });
      if (uploadRes.ok) {
        publicUrl = `${supabaseUrl}/storage/v1/object/public/media/${filename}`;
        console.log(`[media/upload] Supabase OK: ${publicUrl}`);
      } else {
        const errBody = await uploadRes.text();
        console.error(`[media/upload] Supabase ${uploadRes.status}: ${errBody}`);
      }
    } catch (err) {
      console.error("[media/upload] Supabase error:", err.message);
    }
  } else {
    console.warn("[media/upload] Supabase not configured, storing base64 fallback");
  }

  await withTables(async () => {
    if (publicUrl) {
      await pool.query(
        `INSERT INTO media_items (id, name, tag, url, folder_id, used) VALUES ($1,$2,$3,$4,$5,FALSE) ON CONFLICT (id) DO NOTHING`,
        [id, name, tag ?? null, publicUrl, folderId ?? null]
      );
    } else {
      // Supabase not configured — store base64 directly in url column as fallback
      await pool.query(
        `INSERT INTO media_items (id, name, tag, url, folder_id, used) VALUES ($1,$2,$3,$4,$5,FALSE) ON CONFLICT (id) DO NOTHING`,
        [id, name, tag ?? null, dataUrl, folderId ?? null]
      );
    }
    invalidateMedia();
    const createdAt = new Date().toISOString();
    res.json({ id, name, tag: tag ?? null, dataUrl: publicUrl ?? dataUrl, folderId: folderId ?? null, createdAt });
  }, res);
});

// POST /api/media — legacy endpoint for backward compat (and video saves)
app.post("/api/media", async (req, res) => {
  const { id, name, tag, dataUrl, used } = req.body;
  if (typeof dataUrl === "string" && dataUrl.startsWith("data:video/")) {
    return res.status(400).json({ error: "VIDEO_NOT_SUPPORTED" });
  }
  await withTables(async () => {
    await pool.query(
      `INSERT INTO media_items (id, name, tag, url, used) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [id, name, tag ?? null, dataUrl ?? "", used ?? false]
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
    // Fetch URL before deletion so we can clean Supabase Storage
    const row = await pool.query("SELECT url FROM media_items WHERE id = $1", [req.params.id]);
    const publicUrl = row.rows[0]?.url ?? null;

    await pool.query("DELETE FROM media_items WHERE id = $1", [req.params.id]);
    invalidateMedia();
    res.json({ ok: true });

    // Non-blocking Supabase Storage cleanup
    if (publicUrl && publicUrl.startsWith("http")) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
      if (supabaseUrl && supabaseKey) {
        const marker = "/storage/v1/object/public/media/";
        const idx = publicUrl.indexOf(marker);
        if (idx !== -1) {
          const filename = publicUrl.slice(idx + marker.length);
          fetch(`${supabaseUrl}/storage/v1/object/media/${filename}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${supabaseKey}` },
          }).then(async (r) => {
            if (!r.ok) console.warn(`[delete] Supabase Storage delete ${r.status}:`, await r.text());
          }).catch((err) => console.warn("[delete] Supabase Storage delete error:", err.message));
        }
      }
    }
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

app.put("/api/posts/:id", async (req, res) => {
  const { day, caption, tagsSummary, slideCount, scheduledDate, scheduledTime, mediaIds, status } = req.body;
  await withTables(async () => {
    await pool.query(
      `UPDATE approved_posts SET
         day = $1, caption = $2, tags_summary = $3,
         slide_count = $4, scheduled_date = $5,
         scheduled_time = $6, media_ids = $7,
         status = $8
       WHERE id = $9`,
      [day, caption ?? "", tagsSummary ?? "", String(slideCount ?? 1),
       scheduledDate ?? null, scheduledTime ?? null,
       mediaIds ? JSON.stringify(mediaIds) : null,
       status ?? "approved", req.params.id]
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

// /api/drafts — alias for POST /api/posts (drafts are stored in approved_posts with status:"draft")
app.post("/api/drafts", async (req, res) => {
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
       status ?? "draft"]
    );
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
  console.log("[POST /api/folders] body:", JSON.stringify({ id, name, mediaIds }));
  if (!id || !name) {
    console.warn("[POST /api/folders] Missing id or name — rejecting");
    return res.status(400).json({ error: "id and name are required" });
  }
  await withTables(async () => {
    const result = await pool.query(
      "INSERT INTO media_folders (id, name, media_ids) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id",
      [id, name, mediaIds ? JSON.stringify(mediaIds) : "[]"]
    );
    console.log("[POST /api/folders] DB insert result rowCount:", result.rowCount);
    invalidateFolders();
    res.json({ ok: true, id });
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
  const model = req.body?.model ?? "(none)";
  console.log(`[claude] model=${model} ANTHROPIC_API_KEY present:`, !!apiKey, "len:", apiKey ? apiKey.length : 0);

  if (!apiKey) {
    console.error("[claude] ANTHROPIC_API_KEY is not set — cannot generate captions");
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server" });
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...req.body, model: "claude-haiku-4-5-20251001", max_tokens: 250 }),
    });
    const data = await response.json();
    console.log(`[claude] Anthropic status=${response.status} error=${data?.error?.message ?? "none"}`);
    if (!response.ok) {
      console.error("[claude] Anthropic rejected request:", JSON.stringify(data).slice(0, 500));
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    console.error("[claude] fetch error:", err?.message);
    res.status(502).json({ error: "Failed to reach Anthropic API: " + (err?.message ?? "unknown") });
  }
});

// ── Supabase Storage Upload ────────────────────────────────────────────────────

app.post("/api/upload", async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Not configured — tell frontend to fall back to base64
    return res.status(503).json({ error: "Supabase not configured", fallback: true });
  }

  const { dataUrl, id } = req.body;
  if (!dataUrl || !id) {
    return res.status(400).json({ error: "dataUrl and id are required" });
  }

  const comma = dataUrl.indexOf(",");
  if (comma === -1) {
    return res.status(400).json({ error: "Invalid dataUrl format" });
  }

  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mediaType = header.split(";")[0].replace("data:", "") || "image/jpeg";
  const ext = mediaType.split("/")[1]?.split("+")[0] || "jpg";
  const filename = `${id}.${ext}`;

  try {
    const buffer = Buffer.from(base64, "base64");
    console.log(`[upload] Uploading ${filename} (${buffer.length} bytes) to Supabase`);

    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/media/${filename}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": mediaType,
        "x-upsert": "true",
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      console.error(`[upload] Supabase error ${uploadRes.status}:`, errBody);
      return res.status(502).json({ error: `Supabase upload failed: ${uploadRes.status} — ${errBody}` });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/media/${filename}`;
    console.log(`[upload] Success: ${publicUrl}`);
    res.json({ url: publicUrl });
  } catch (err) {
    console.error("[upload] Unexpected error:", err);
    res.status(502).json({ error: err.message });
  }
});

// ── AI — Image Auto-Tag ───────────────────────────────────────────────────────

const VALID_TAGS = ["me", "outfit", "food", "drinks", "dj", "vibe", "friends", "location", "outdoor", "night", "pet", "animal", "other"];

app.post("/api/analyze", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log("[analyze] ANTHROPIC_API_KEY present:", !!apiKey, "length:", apiKey ? apiKey.length : 0);

  if (!apiKey) {
    console.error("[analyze] ANTHROPIC_API_KEY is not set — returning 'other'");
    return res.status(500).json({ tag: "other", error: "ANTHROPIC_API_KEY not configured" });
  }

  const { dataUrl, url } = req.body;
  if (!dataUrl && !url) {
    return res.status(400).json({ tag: "other", error: "dataUrl or url is required" });
  }

  let base64, mediaType;

  if (url && typeof url === "string" && url.startsWith("http")) {
    // Fetch image from Supabase public URL and convert to base64
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        console.warn(`[analyze] Failed to fetch url ${url} — status ${imgRes.status}`);
        return res.json({ tag: "other" });
      }
      const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
      mediaType = contentType.split(";")[0].trim();
      const buf = Buffer.from(await imgRes.arrayBuffer());
      base64 = buf.toString("base64");
      console.log(`[analyze] Fetched url, mediaType=${mediaType} base64Length=${base64.length}`);
    } catch (err) {
      console.warn("[analyze] Error fetching image url:", err.message);
      return res.json({ tag: "other" });
    }
  } else if (dataUrl && typeof dataUrl === "string") {
    const comma = dataUrl.indexOf(",");
    if (comma === -1) return res.status(400).json({ tag: "other", error: "Invalid dataUrl format" });
    const header = dataUrl.slice(0, comma);
    base64 = dataUrl.slice(comma + 1);
    mediaType = header.split(";")[0].replace("data:", "");
    console.log(`[analyze] dataUrl path, mediaType=${mediaType} base64Length=${base64.length}`);
  } else {
    return res.status(400).json({ tag: "other", error: "Invalid dataUrl or url" });
  }

  const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];

  if (!supportedTypes.includes(mediaType)) {
    console.warn(`[analyze] Unsupported mediaType: ${mediaType} — returning 'other'`);
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
        model: "claude-haiku-4-5-20251001",
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
- "food" → Food is clearly visible: meal, restaurant plate, dessert, snacks, pizza, burger, sushi, etc. If BOTH food AND drinks are visible, choose "food".
- "drinks" → Drinks are the subject with NO significant food present: wine glass, cocktail, beer, coffee cup, juice, bottle of wine or spirits, bartender pouring drinks.
- "pet" → Image features a dog or cat as the main subject.
- "animal" → Any other animal that is NOT a dog or cat: bird, horse, rabbit, cow, wild animal, etc.
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
    console.log(`[analyze] Anthropic status=${response.status} response:`, JSON.stringify(data).slice(0, 300));

    if (!response.ok) {
      console.error("[analyze] Anthropic API error:", data?.error?.message);
      return res.json({ tag: "other", error: data?.error?.message });
    }

    const rawText = data.content?.[0]?.text ?? "";
    const cleaned = rawText.toLowerCase().trim().replace(/[^a-z]/g, "");
    const tag = VALID_TAGS.includes(cleaned) ? cleaned : "other";
    console.log(`[analyze] rawText="${rawText}" cleaned="${cleaned}" finalTag="${tag}"`);
    res.json({ tag });
  } catch (err) {
    console.error("[analyze] Unexpected error:", err);
    res.status(502).json({ tag: "other", error: "Failed to reach Anthropic API" });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`InstaFlow API server running on port ${PORT}`);
});
