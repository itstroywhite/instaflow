/**
 * InstaFlow — Standalone Railway Server
 * Single-file Express server with all API routes.
 * Run with: node railway-server.js
 * Requires env vars: DATABASE_URL, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
 */

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — allow all origins so the Vercel frontend can talk to this Render backend.
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.options("*", cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Supabase admin client (for auth token verification) ─────────────────────

const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// In-memory token cache to avoid calling Supabase on every request
const tokenCache = new Map(); // token -> { userId, expiry }
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized — no token provided" });
  }
  const token = authHeader.slice(7);

  // Fast path: serve from cache
  const cached = tokenCache.get(token);
  if (cached && cached.expiry > Date.now()) {
    req.userId = cached.userId;
    return next();
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Auth not configured — SUPABASE_URL and SUPABASE_SERVICE_KEY required" });
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Unauthorized — invalid token" });
    }
    tokenCache.set(token, { userId: user.id, expiry: Date.now() + TOKEN_CACHE_TTL });
    req.userId = user.id;
    next();
  } catch (err) {
    console.error("[requireAuth] error:", err?.message);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// ── Database ────────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

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
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';

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
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS media_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      media_ids TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE media_folders ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
  `);
}

let tablesReady = false;
async function withTables(fn, res) {
  try {
    if (!tablesReady) { await ensureTables(); tablesReady = true; }
    await fn();
  } catch (err) {
    if (err?.code === "ECONNREFUSED" || err?.code === "ECONNRESET" || err?.code === "57P03") {
      tablesReady = false;
    }
    console.error("[DB error] code:", err?.code, "msg:", err?.message);
    if (!res.headersSent) res.status(500).json({ error: err?.message ?? "Database error" });
  }
}

// ── Per-user in-memory caches ────────────────────────────────────────────────
// Each cache is keyed by userId so different users never see each other's data.

const userMediaCache = {};    // userId -> items[]
const userPostsCache = {};    // userId -> posts[]
const userFoldersCache = {};  // userId -> folders[]
const userSettingsCache = {}; // userId -> settings{}

const PAGE_SIZE = 20;

function invalidateMedia(userId) { delete userMediaCache[userId]; }
function invalidatePosts(userId) { delete userPostsCache[userId]; }
function invalidateSettings(userId) { delete userSettingsCache[userId]; }
function invalidateFolders(userId) { delete userFoldersCache[userId]; }

// ── Health ───────────────────────────────────────────────────────────────────

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Media ────────────────────────────────────────────────────────────────────

app.get("/api/media", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    if (!userMediaCache[userId]) {
      const result = await pool.query(
        `SELECT id, name, tag, url, folder_id, used, created_at
         FROM media_items
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );
      userMediaCache[userId] = result.rows.map((r) => ({
        id: r.id, name: r.name, tag: r.tag,
        dataUrl: r.url ?? "",
        folderId: r.folder_id ?? null,
        used: r.used ?? false, createdAt: r.created_at,
      }));
    }
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const offset = (page - 1) * PAGE_SIZE;
    const items = userMediaCache[userId].slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < userMediaCache[userId].length;
    const total = userMediaCache[userId].length;
    res.json({ items, hasMore, total, page });
  }, res);
});

app.post("/api/media/upload", requireAuth, async (req, res) => {
  const userId = req.userId;
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
  const filename = `${userId}/${id}-${Date.now()}.${ext}`;

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
    const storeUrl = publicUrl ?? dataUrl;
    await pool.query(
      `INSERT INTO media_items (id, name, tag, url, folder_id, used, user_id)
       VALUES ($1,$2,$3,$4,$5,FALSE,$6)
       ON CONFLICT (id) DO NOTHING`,
      [id, name, tag ?? null, storeUrl, folderId ?? null, userId]
    );
    invalidateMedia(userId);
    const createdAt = new Date().toISOString();
    res.json({ id, name, tag: tag ?? null, dataUrl: storeUrl, folderId: folderId ?? null, createdAt });
  }, res);
});

app.post("/api/media", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id, name, tag, dataUrl, used } = req.body;
  if (typeof dataUrl === "string" && dataUrl.startsWith("data:video/")) {
    return res.status(400).json({ error: "VIDEO_NOT_SUPPORTED" });
  }
  await withTables(async () => {
    await pool.query(
      `INSERT INTO media_items (id, name, tag, url, used, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [id, name, tag ?? null, dataUrl ?? "", used ?? false, userId]
    );
    invalidateMedia(userId);
    res.json({ ok: true });
  }, res);
});

app.patch("/api/media/:id", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { tag, used } = req.body;
  await withTables(async () => {
    if (tag !== undefined && used !== undefined) {
      await pool.query("UPDATE media_items SET tag = $1, used = $2 WHERE id = $3 AND user_id = $4", [tag, used, req.params.id, userId]);
    } else if (tag !== undefined) {
      await pool.query("UPDATE media_items SET tag = $1 WHERE id = $2 AND user_id = $3", [tag, req.params.id, userId]);
    } else if (used !== undefined) {
      await pool.query("UPDATE media_items SET used = $1 WHERE id = $2 AND user_id = $3", [used, req.params.id, userId]);
    }
    invalidateMedia(userId);
    res.json({ ok: true });
  }, res);
});

app.delete("/api/media/:id", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    const row = await pool.query("SELECT url FROM media_items WHERE id = $1 AND user_id = $2", [req.params.id, userId]);
    const publicUrl = row.rows[0]?.url ?? null;

    await pool.query("DELETE FROM media_items WHERE id = $1 AND user_id = $2", [req.params.id, userId]);
    invalidateMedia(userId);
    res.json({ ok: true });

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
// Settings are stored with key prefixed by userId: "{userId}:{key}"
// This avoids schema changes to the existing PRIMARY KEY on `key`.

app.get("/api/settings", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    if (userSettingsCache[userId]) { res.json(userSettingsCache[userId]); return; }
    const prefix = `${userId}:`;
    const result = await pool.query(
      "SELECT key, value FROM app_settings WHERE key LIKE $1",
      [`${prefix}%`]
    );
    const settings = {};
    for (const row of result.rows) {
      const rawKey = row.key.startsWith(prefix) ? row.key.slice(prefix.length) : row.key;
      settings[rawKey] = row.value;
    }
    userSettingsCache[userId] = settings;
    res.json(settings);
  }, res);
});

app.put("/api/settings/:key", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { value } = req.body;
  const scopedKey = `${userId}:${req.params.key}`;
  await withTables(async () => {
    await pool.query(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
      [scopedKey, value]
    );
    invalidateSettings(userId);
    res.json({ ok: true });
  }, res);
});

// ── Posts & Drafts ────────────────────────────────────────────────────────────

app.get("/api/posts", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    if (userPostsCache[userId]) { res.json(userPostsCache[userId]); return; }
    const result = await pool.query(
      `SELECT id, day, caption, tags_summary, slide_count, scheduled_date, scheduled_time, media_ids, status, created_at
       FROM approved_posts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    userPostsCache[userId] = result.rows.map((r) => ({
      id: r.id, day: r.day, caption: r.caption, tagsSummary: r.tags_summary,
      slideCount: parseInt(r.slide_count, 10),
      scheduledDate: r.scheduled_date ?? null,
      scheduledTime: r.scheduled_time ?? null,
      mediaIds: r.media_ids ? JSON.parse(r.media_ids) : [],
      status: r.status ?? "approved",
      createdAt: r.created_at,
    }));
    res.json(userPostsCache[userId]);
  }, res);
});

app.post("/api/posts", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id, day, caption, tagsSummary, slideCount, scheduledDate, scheduledTime, mediaIds, status } = req.body;
  await withTables(async () => {
    await pool.query(
      `INSERT INTO approved_posts (id, day, caption, tags_summary, slide_count, scheduled_date, scheduled_time, media_ids, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         day = EXCLUDED.day, caption = EXCLUDED.caption, tags_summary = EXCLUDED.tags_summary,
         slide_count = EXCLUDED.slide_count, scheduled_date = EXCLUDED.scheduled_date,
         scheduled_time = EXCLUDED.scheduled_time, media_ids = EXCLUDED.media_ids,
         status = EXCLUDED.status`,
      [id, day, caption ?? "", tagsSummary ?? "", String(slideCount ?? 1),
       scheduledDate ?? null, scheduledTime ?? null,
       mediaIds ? JSON.stringify(mediaIds) : null,
       status ?? "approved", userId]
    );
    invalidatePosts(userId);
    res.json({ ok: true });
  }, res);
});

app.put("/api/posts/:id", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { day, caption, tagsSummary, slideCount, scheduledDate, scheduledTime, mediaIds, status } = req.body;
  await withTables(async () => {
    await pool.query(
      `UPDATE approved_posts SET
         day = $1, caption = $2, tags_summary = $3,
         slide_count = $4, scheduled_date = $5,
         scheduled_time = $6, media_ids = $7,
         status = $8
       WHERE id = $9 AND user_id = $10`,
      [day, caption ?? "", tagsSummary ?? "", String(slideCount ?? 1),
       scheduledDate ?? null, scheduledTime ?? null,
       mediaIds ? JSON.stringify(mediaIds) : null,
       status ?? "approved", req.params.id, userId]
    );
    invalidatePosts(userId);
    res.json({ ok: true });
  }, res);
});

app.delete("/api/posts/:id", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    await pool.query("DELETE FROM approved_posts WHERE id = $1 AND user_id = $2", [req.params.id, userId]);
    invalidatePosts(userId);
    res.json({ ok: true });
  }, res);
});

app.post("/api/drafts", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id, day, caption, tagsSummary, slideCount, scheduledDate, scheduledTime, mediaIds, status } = req.body;
  await withTables(async () => {
    await pool.query(
      `INSERT INTO approved_posts (id, day, caption, tags_summary, slide_count, scheduled_date, scheduled_time, media_ids, status, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         day = EXCLUDED.day, caption = EXCLUDED.caption, tags_summary = EXCLUDED.tags_summary,
         slide_count = EXCLUDED.slide_count, scheduled_date = EXCLUDED.scheduled_date,
         scheduled_time = EXCLUDED.scheduled_time, media_ids = EXCLUDED.media_ids,
         status = EXCLUDED.status`,
      [id, day, caption ?? "", tagsSummary ?? "", String(slideCount ?? 1),
       scheduledDate ?? null, scheduledTime ?? null,
       mediaIds ? JSON.stringify(mediaIds) : null,
       status ?? "draft", userId]
    );
    invalidatePosts(userId);
    res.json({ ok: true });
  }, res);
});

// ── Folders ───────────────────────────────────────────────────────────────────

app.get("/api/folders", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    if (userFoldersCache[userId]) { res.json(userFoldersCache[userId]); return; }
    const result = await pool.query(
      "SELECT id, name, media_ids, created_at FROM media_folders WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );
    userFoldersCache[userId] = result.rows.map((r) => ({
      id: r.id, name: r.name,
      mediaIds: r.media_ids ? JSON.parse(r.media_ids) : [],
      createdAt: r.created_at,
    }));
    res.json(userFoldersCache[userId]);
  }, res);
});

app.post("/api/folders", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id, name, mediaIds } = req.body;
  console.log("[POST /api/folders] body:", JSON.stringify({ id, name, mediaIds }));
  if (!id || !name) {
    console.warn("[POST /api/folders] Missing id or name — rejecting");
    return res.status(400).json({ error: "id and name are required" });
  }
  await withTables(async () => {
    const result = await pool.query(
      "INSERT INTO media_folders (id, name, media_ids, user_id) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING RETURNING id",
      [id, name, mediaIds ? JSON.stringify(mediaIds) : "[]", userId]
    );
    console.log("[POST /api/folders] DB insert result rowCount:", result.rowCount);
    invalidateFolders(userId);
    res.json({ ok: true, id });
  }, res);
});

app.patch("/api/folders/:id", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { name, mediaIds } = req.body;
  await withTables(async () => {
    if (name !== undefined && mediaIds !== undefined) {
      await pool.query("UPDATE media_folders SET name = $1, media_ids = $2 WHERE id = $3 AND user_id = $4",
        [name, JSON.stringify(mediaIds), req.params.id, userId]);
    } else if (name !== undefined) {
      await pool.query("UPDATE media_folders SET name = $1 WHERE id = $2 AND user_id = $3", [name, req.params.id, userId]);
    } else if (mediaIds !== undefined) {
      await pool.query("UPDATE media_folders SET media_ids = $1 WHERE id = $2 AND user_id = $3",
        [JSON.stringify(mediaIds), req.params.id, userId]);
    }
    invalidateFolders(userId);
    res.json({ ok: true });
  }, res);
});

app.delete("/api/folders/:id", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    await pool.query("DELETE FROM media_folders WHERE id = $1 AND user_id = $2", [req.params.id, userId]);
    invalidateFolders(userId);
    res.json({ ok: true });
  }, res);
});

// ── AI — Claude Proxy ─────────────────────────────────────────────────────────

app.post("/api/claude", requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const shouldStream = req.body?.stream === true;
  console.log(`[claude] stream=${shouldStream} ANTHROPIC_API_KEY present:`, !!apiKey);

  if (!apiKey) {
    console.error("[claude] ANTHROPIC_API_KEY is not set — cannot generate captions");
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server" });
  }
  try {
    const anthropicBody = { ...req.body, model: "claude-haiku-4-5-20251001", max_tokens: 200 };
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    if (shouldStream) {
      if (!response.ok) {
        const errText = await response.text();
        console.error("[claude] Anthropic stream error:", response.status, errText.slice(0, 300));
        return res.status(response.status).json({ error: errText });
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const reader = response.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { res.end(); break; }
            res.write(value);
          }
        } catch (e) {
          console.error("[claude] stream pipe error:", e?.message);
          res.end();
        }
      };
      pump();
    } else {
      const data = await response.json();
      console.log(`[claude] Anthropic status=${response.status} error=${data?.error?.message ?? "none"}`);
      if (!response.ok) {
        console.error("[claude] Anthropic rejected request:", JSON.stringify(data).slice(0, 500));
        return res.status(response.status).json(data);
      }
      res.json(data);
    }
  } catch (err) {
    console.error("[claude] fetch error:", err?.message);
    res.status(502).json({ error: "Failed to reach Anthropic API: " + (err?.message ?? "unknown") });
  }
});

// ── Supabase Storage Upload ────────────────────────────────────────────────────

app.post("/api/upload", requireAuth, async (req, res) => {
  const userId = req.userId;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: "Supabase not configured", fallback: true });
  }

  const { dataUrl, id } = req.body;
  if (!dataUrl || !id) {
    return res.status(400).json({ error: "dataUrl and id are required" });
  }

  const comma = dataUrl.indexOf(",");
  if (comma === -1) return res.status(400).json({ error: "Invalid dataUrl format" });

  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mediaType = header.split(";")[0].replace("data:", "") || "image/jpeg";
  const ext = mediaType.split("/")[1]?.split("+")[0] || "jpg";
  const filename = `${userId}/${id}.${ext}`;

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

app.post("/api/analyze", requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  let { dataUrl, url: remoteUrl } = req.body;

  // If a remote URL is provided, fetch it and convert to base64
  if (remoteUrl && !dataUrl) {
    try {
      const imgRes = await fetch(remoteUrl);
      if (!imgRes.ok) return res.status(400).json({ error: "Could not fetch remote image" });
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await imgRes.arrayBuffer();
      const b64 = Buffer.from(arrayBuffer).toString("base64");
      dataUrl = `data:${contentType};base64,${b64}`;
    } catch (err) {
      return res.status(400).json({ error: "Failed to fetch remote image: " + err.message });
    }
  }

  if (!dataUrl) return res.status(400).json({ error: "dataUrl or url required" });

  const comma = dataUrl.indexOf(",");
  if (comma === -1) return res.status(400).json({ error: "Invalid dataUrl" });
  const header = dataUrl.slice(0, comma);
  const base64data = dataUrl.slice(comma + 1);
  const mediaType = header.split(";")[0].replace("data:", "") || "image/jpeg";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 20,
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64data },
          }, {
            type: "text",
            text: `Classify this image into exactly one of these categories: ${VALID_TAGS.join(", ")}. Reply with only the category word, nothing else.`,
          }],
        }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errData?.error?.message ?? "Anthropic error", tag: "other" });
    }
    const data = await response.json();
    const raw = data?.content?.[0]?.text?.trim()?.toLowerCase() ?? "other";
    const tag = VALID_TAGS.includes(raw) ? raw : "other";
    res.json({ tag });
  } catch (err) {
    console.error("[analyze] error:", err?.message);
    res.status(502).json({ error: "Failed to analyze image", tag: "other" });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`InstaFlow server running on port ${PORT}`);
  console.log(`Supabase auth: ${supabaseAdmin ? "configured" : "NOT configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY"}`);
});
