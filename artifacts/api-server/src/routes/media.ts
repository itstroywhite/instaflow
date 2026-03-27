import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

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
async function withTables(fn: () => Promise<void>, res: any) {
  try {
    if (!tablesReady) { await ensureTables(); tablesReady = true; }
    await fn();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Database error" });
  }
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Cache stores ALL image items (no videos). Pagination is done in-memory.
let mediaCache: any[] | null = null;
let postsCache: any[] | null = null;
let settingsCache: Record<string, string> | null = null;
let foldersCache: any[] | null = null;

function invalidateMedia() { mediaCache = null; }
function invalidatePosts() { postsCache = null; }
function invalidateSettings() { settingsCache = null; }
function invalidateFolders() { foldersCache = null; }

const PAGE_SIZE = 20;

// ─── Media ────────────────────────────────────────────────────────────────────
// GET /api/media?page=1   (1-indexed, default 1, page size 20)
router.get("/media", async (req, res) => {
  await withTables(async () => {
    if (!mediaCache) {
      // Only load images — no videos allowed
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

router.post("/media", async (req, res) => {
  const { id, name, tag, dataUrl, used } = req.body;

  // Block video uploads entirely
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

router.patch("/media/:id", async (req, res) => {
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

router.delete("/media/:id", async (req, res) => {
  await withTables(async () => {
    await pool.query("DELETE FROM media_items WHERE id = $1", [req.params.id]);
    invalidateMedia();
    res.json({ ok: true });
  }, res);
});

// ─── Settings ─────────────────────────────────────────────────────────────────
router.get("/settings", async (req, res) => {
  await withTables(async () => {
    if (settingsCache) { res.json(settingsCache); return; }
    const result = await pool.query("SELECT key, value FROM app_settings");
    const settings: Record<string, string> = {};
    for (const row of result.rows) settings[row.key] = row.value;
    settingsCache = settings;
    res.json(settings);
  }, res);
});

router.put("/settings/:key", async (req, res) => {
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

// ─── Posts ────────────────────────────────────────────────────────────────────
router.get("/posts", async (req, res) => {
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

router.post("/posts", async (req, res) => {
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

router.delete("/posts/:id", async (req, res) => {
  await withTables(async () => {
    await pool.query("DELETE FROM approved_posts WHERE id = $1", [req.params.id]);
    invalidatePosts();
    res.json({ ok: true });
  }, res);
});

// ─── Folders ──────────────────────────────────────────────────────────────────
router.get("/folders", async (req, res) => {
  await withTables(async () => {
    if (foldersCache) { res.json(foldersCache); return; }
    const result = await pool.query(
      "SELECT id, name, media_ids, created_at FROM media_folders ORDER BY created_at ASC"
    );
    foldersCache = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      mediaIds: r.media_ids ? JSON.parse(r.media_ids) : [],
      createdAt: r.created_at,
    }));
    res.json(foldersCache);
  }, res);
});

router.post("/folders", async (req, res) => {
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

router.patch("/folders/:id", async (req, res) => {
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

router.delete("/folders/:id", async (req, res) => {
  await withTables(async () => {
    await pool.query("DELETE FROM media_folders WHERE id = $1", [req.params.id]);
    invalidateFolders();
    res.json({ ok: true });
  }, res);
});

export default router;
