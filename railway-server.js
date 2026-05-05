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
const webpush = require("web-push");
const stripe = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Web Push (VAPID) ─────────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:" + (process.env.VAPID_EMAIL || "hello@instaflow.app"),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log("[push] VAPID keys configured");
} else {
  console.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push disabled");
}

// CORS — allow all origins so the Vercel frontend can talk to this Render backend.
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.options("*", cors());

// ── Stripe helpers ─────────────────────────────────────────────────────────────
function getPlanFromPriceId(priceId) {
  const agencyIds = [
    process.env.STRIPE_AGENCY_MONTHLY_PRICE_ID,
    process.env.STRIPE_AGENCY_YEARLY_PRICE_ID,
  ].filter(Boolean);
  return agencyIds.includes(priceId) ? "agency" : "pro";
}
function getPeriodFromPriceId(priceId) {
  const yearlyIds = [
    process.env.STRIPE_PRO_YEARLY_PRICE_ID,
    process.env.STRIPE_AGENCY_YEARLY_PRICE_ID,
  ].filter(Boolean);
  return yearlyIds.includes(priceId) ? "yearly" : "monthly";
}

// ── Stripe webhook — MUST be before express.json() to receive raw body ─────────
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe webhook] sig verify failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      if (userId && subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0]?.price.id;
        const plan = getPlanFromPriceId(priceId);
        const period = getPeriodFromPriceId(priceId);
        await pool.query(
          `UPDATE profiles SET plan = $1, stripe_customer_id = $2, stripe_subscription_id = $3,
           subscription_status = 'active', subscription_period = $4 WHERE user_id = $5`,
          [plan, customerId, subscriptionId, period, userId]
        );
        console.log(`[stripe] Activated ${plan}/${period} for user ${userId}`);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const { rows } = await pool.query(
        `UPDATE profiles SET plan = 'free', subscription_status = 'cancelled',
         stripe_subscription_id = NULL WHERE stripe_subscription_id = $1 RETURNING user_id`,
        [sub.id]
      );
      if (rows.length) console.log(`[stripe] Cancelled subscription for user ${rows[0].user_id}`);
    } else if (event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const priceId = sub.items.data[0]?.price.id;
      const plan = getPlanFromPriceId(priceId);
      const period = getPeriodFromPriceId(priceId);
      await pool.query(
        `UPDATE profiles SET plan = $1, subscription_status = $2, subscription_period = $3
         WHERE stripe_subscription_id = $4`,
        [plan, sub.status === "active" ? "active" : sub.status, period, sub.id]
      );
    }
  } catch (err) {
    console.error("[stripe webhook] handler error:", err.message);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

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
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS used_ai_caption BOOLEAN DEFAULT FALSE;
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS used_ai_tagging BOOLEAN DEFAULT FALSE;
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS used_video BOOLEAN DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS media_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      media_ids TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE media_folders ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';

    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS file_hash TEXT;
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS file_size INTEGER;
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS dimensions TEXT;
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT,
      instagram_username TEXT,
      caption_style TEXT DEFAULT 'minimal',
      language TEXT DEFAULT 'en',
      plan TEXT DEFAULT 'free',
      avatar_url TEXT,
      onboarding_complete BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Berlin';
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS prevent_duplicates BOOLEAN DEFAULT true;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_daily BOOLEAN DEFAULT true;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_time TEXT DEFAULT '09:00';
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notify_updates BOOLEAN DEFAULT false;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_notification_sent TIMESTAMPTZ;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free';
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_period TEXT DEFAULT 'monthly';

    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'image';
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS duration FLOAT;
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
    ALTER TABLE media_items ADD COLUMN IF NOT EXISTS display_name TEXT;

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, endpoint)
    );

    CREATE TABLE IF NOT EXISTS posting_schedule (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      day_of_week INTEGER,
      hour INTEGER,
      engagement_score FLOAT DEFAULT 1.0,
      post_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS filter_presets (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      settings JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS instagram_post_id TEXT;
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
    ALTER TABLE approved_posts ADD COLUMN IF NOT EXISTS post_error TEXT;
  `);
  await pool.query(`DELETE FROM approved_posts WHERE user_id = '1ed0fef8-adda-43b7-bfcc-74c2702bf01c'`);
  console.log('[cleanup] deleted all posts for test user');
}

// One-time startup dedup: removes exact hash duplicates (keeps oldest), then falls back to size+dims.
async function cleanupDuplicates() {
  try {
    // Delete duplicates by file_hash (keep oldest created_at per user+hash)
    const hashDups = await pool.query(`
      DELETE FROM media_items
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, file_hash ORDER BY created_at ASC) AS rn
          FROM media_items
          WHERE file_hash IS NOT NULL AND file_hash <> ''
        ) ranked
        WHERE rn > 1
      )
      RETURNING id
    `);
    if (hashDups.rowCount > 0) console.log(`[cleanup] Removed ${hashDups.rowCount} hash-duplicate media items`);

    // Delete duplicates by file_size + dimensions (keep oldest per user+size+dims)
    const dimDups = await pool.query(`
      DELETE FROM media_items
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, file_size, dimensions ORDER BY created_at ASC) AS rn
          FROM media_items
          WHERE (file_hash IS NULL OR file_hash = '')
            AND file_size IS NOT NULL AND file_size > 0
            AND dimensions IS NOT NULL AND dimensions <> ''
        ) ranked
        WHERE rn > 1
      )
      RETURNING id
    `);
    if (dimDups.rowCount > 0) console.log(`[cleanup] Removed ${dimDups.rowCount} size+dims-duplicate media items`);
  } catch (err) {
    console.error("[cleanup] Duplicate cleanup error:", err.message);
  }
}

let tablesReady = false;
async function withTables(fn, res) {
  try {
    if (!tablesReady) { await ensureTables(); tablesReady = true; cleanupDuplicates(); }
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

// ── Media proxy (avoids CORS taint on iOS Safari canvas) ─────────────────────

app.get("/api/media/proxy", async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url query param required" });
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).json({ error: "upstream fetch failed" });
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Content-Type", contentType);
    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("[proxy] error fetching media:", err);
    res.status(500).json({ error: "proxy error" });
  }
});

// ── Media ────────────────────────────────────────────────────────────────────

app.get("/api/media/count", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    const result = await pool.query(
      "SELECT COUNT(*) AS total FROM media_items WHERE user_id = $1",
      [userId]
    );
    res.json({ total: parseInt(result.rows[0].total, 10) });
  }, res);
});

// Batch fetch specific media items by IDs (used by post preview when items aren't in client cache)
app.get("/api/media/by-ids", requireAuth, async (req, res) => {
  const userId = req.userId;
  const rawIds = String(req.query.ids ?? "");
  if (!rawIds) return res.json([]);
  const ids = rawIds.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
  if (!ids.length) return res.json([]);
  await withTables(async () => {
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(",");
    const { rows } = await pool.query(
      `SELECT id, name, tag, url, used, created_at, is_favorite, media_type, duration, thumbnail_url
       FROM media_items
       WHERE user_id = $1 AND id IN (${placeholders})`,
      [userId, ...ids]
    );
    const items = rows.map((r) => ({
      id: r.id, name: r.name, tag: r.tag,
      dataUrl: r.url ?? "",
      used: r.used ?? false, createdAt: r.created_at,
      isFavorite: r.is_favorite ?? false,
      media_type: r.media_type ?? "image",
      duration: r.duration ?? null,
      thumbnail_url: r.thumbnail_url ?? null,
    }));
    res.json(items);
  }, res);
});

function mapMediaRow(r) {
  // Only accept a URL that actually starts with http — empty strings / legacy base64 become null
  const httpUrl = (s) => (typeof s === "string" && s.startsWith("http") ? s : null);
  const resolvedUrl = httpUrl(r.url) ?? httpUrl(r.data_url) ?? null;
  return {
    id: r.id, name: r.name, display_name: r.display_name ?? null, tag: r.tag,
    url: resolvedUrl,
    dataUrl: resolvedUrl,
    folderId: r.folder_id ?? null,
    used: r.used ?? false, createdAt: r.created_at,
    isFavorite: r.is_favorite ?? false,
    media_type: r.media_type ?? "image",
    duration: r.duration ?? null,
    thumbnail_url: r.thumbnail_url ?? null,
  };
}

app.get("/api/media", requireAuth, async (req, res) => {
  const userId = req.userId;
  const search = (req.query.search ?? "").toString().trim();
  await withTables(async () => {
    if (search) {
      const result = await pool.query(
        `SELECT id, name, display_name, tag, url, folder_id, used, created_at, is_favorite,
                media_type, duration, thumbnail_url
         FROM media_items
         WHERE user_id = $1
           AND (display_name ILIKE $2 OR tag ILIKE $2 OR name ILIKE $2)
         ORDER BY created_at DESC`,
        [userId, `%${search}%`]
      );
      const items = result.rows.map(mapMediaRow);
      return res.json({ items, hasMore: false, total: items.length, page: 1, search });
    }
    if (!userMediaCache[userId]) {
      const result = await pool.query(
        `SELECT id, name, display_name, tag, url, folder_id, used, created_at, is_favorite,
                media_type, duration, thumbnail_url
         FROM media_items
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );
      userMediaCache[userId] = result.rows.map(mapMediaRow);
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
  const { id, name, dataUrl, tag, folderId, fileHash, fileSize, dimensions, media_type: reqMediaType, thumbnail_url: reqThumbUrl, duration: reqDuration } = req.body;
  if (!id || !name || !dataUrl) {
    return res.status(400).json({ error: "id, name, and dataUrl are required" });
  }
  // Detect media type: explicit field > MIME prefix in dataUrl
  const isVideoUpload = reqMediaType === "video" || (typeof dataUrl === "string" && dataUrl.startsWith("data:video/"));

  // ── Duplicate detection (server-side) ──────────────────────────────────────
  // Ensures cross-device uploads of the same file are caught even when the
  // client's in-memory state doesn't know about it yet.
  let isDuplicate = false;
  try {
    if (!tablesReady) { await ensureTables(); tablesReady = true; cleanupDuplicates(); }
    const hasHash = fileHash && typeof fileHash === "string" && fileHash.length > 0;
    const hasSizeDims = fileSize > 0 && dimensions;
    if (hasHash || hasSizeDims) {
      const dupCheck = await pool.query(
        `SELECT id FROM media_items WHERE user_id = $1 AND (file_hash = $2 OR (file_size = $3 AND dimensions = $4)) LIMIT 1`,
        [userId, hasHash ? fileHash : null, hasSizeDims ? fileSize : null, hasSizeDims ? dimensions : null]
      );
      if (dupCheck.rowCount > 0) isDuplicate = true;
    }
    if (isDuplicate) {
      return res.status(409).json({ message: "This file already exists in your pool" });
    }
  } catch (err) {
    console.error("[media/upload] Duplicate check error:", err.message);
    // Don't block the upload if the dedup check fails — just proceed
  }

  const comma = dataUrl.indexOf(",");
  if (comma === -1) return res.status(400).json({ error: "Invalid dataUrl format" });
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  let mediaType = header.split(";")[0].replace("data:", "") || "image/jpeg";
  // Normalise QuickTime/MOV → MP4 so Supabase serves it with a streamable MIME type
  if (mediaType === "video/quicktime") mediaType = "video/mp4";
  let ext = mediaType.split("/")[1]?.split("+")[0] || (isVideoUpload ? "mp4" : "jpg");
  if (ext === "quicktime") ext = "mp4";
  const filename = `${userId}/${id}-${Date.now()}.${ext}`;

  // ── Diagnostic logging (always) ──────────────────────────────────────────
  console.log(`[upload] media_type: ${mediaType}, size: ${base64.length}, filename: ${filename}, isVideo: ${isVideoUpload}`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  // ── Videos MUST go to Supabase Storage — no base64 fallback ─────────────
  if (isVideoUpload && (!supabaseUrl || !supabaseKey)) {
    console.error("[upload] VIDEO upload rejected — Supabase env vars not set");
    return res.status(503).json({ error: "Video storage not configured — SUPABASE_URL/SUPABASE_SERVICE_KEY missing" });
  }

  let publicUrl = null;
  if (supabaseUrl && supabaseKey) {
    try {
      const buffer = Buffer.from(base64, "base64");
      console.log(`[upload] Uploading to Supabase Storage: ${filename} (${buffer.length} bytes, type=${mediaType})`);

      // Use AbortController so very large video uploads don't hang forever
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), isVideoUpload ? 180_000 : 60_000);

      let uploadRes;
      try {
        uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/media/${filename}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": mediaType,
            "x-upsert": "true",
          },
          body: buffer,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (uploadRes.ok) {
        publicUrl = `${supabaseUrl}/storage/v1/object/public/media/${filename}`;
        console.log(`[upload] Supabase Storage OK → ${publicUrl}`);
      } else {
        const errBody = await uploadRes.text();
        console.error(`[upload] Supabase Storage error ${uploadRes.status}: ${errBody}`);
        // Hard fail for videos — cannot store 50MB of base64 in the DB
        if (isVideoUpload) {
          return res.status(502).json({ error: `Video storage upload failed (${uploadRes.status}): ${errBody}` });
        }
      }
    } catch (err) {
      console.error("[upload] Supabase fetch threw:", err.message);
      if (isVideoUpload) {
        return res.status(502).json({ error: `Video storage upload failed: ${err.message}` });
      }
    }
  } else {
    console.warn("[upload] Supabase not configured, storing base64 fallback (images only)");
  }

  await withTables(async () => {
    const storeUrl = publicUrl ?? dataUrl;
    const finalMediaType = isVideoUpload ? "video" : "image";
    const finalTag = isVideoUpload ? "video" : (tag ?? null);
    // For videos: store thumbnail as base64 in thumbnail_url (thumbnails are small ~20-50KB)
    const thumbUrl = isVideoUpload ? (reqThumbUrl || null) : null;
    const dur = isVideoUpload ? (reqDuration || null) : null;
    await pool.query(
      `INSERT INTO media_items (id, name, tag, url, folder_id, used, user_id, file_hash, file_size, dimensions, media_type, thumbnail_url, duration)
       VALUES ($1,$2,$3,$4,$5,FALSE,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         url = EXCLUDED.url,
         thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, media_items.thumbnail_url),
         duration = COALESCE(EXCLUDED.duration, media_items.duration),
         media_type = COALESCE(EXCLUDED.media_type, media_items.media_type)`,
      [id, name, finalTag, storeUrl, folderId ?? null, userId,
       fileHash || null, fileSize || null, dimensions || null, finalMediaType, thumbUrl, dur]
    );
    invalidateMedia(userId);
    const createdAt = new Date().toISOString();
    // Return both url and dataUrl so clients can use either field
    res.json({ id, name, tag: finalTag, url: storeUrl, dataUrl: storeUrl, folderId: folderId ?? null, createdAt, media_type: finalMediaType, thumbnail_url: thumbUrl, duration: dur });
  }, res);
});

app.post("/api/media", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id, name, tag, dataUrl, used } = req.body;
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
  const { tag, used, display_name } = req.body;
  await withTables(async () => {
    if (tag !== undefined && used !== undefined) {
      await pool.query("UPDATE media_items SET tag = $1, used = $2 WHERE id = $3 AND user_id = $4", [tag, used, req.params.id, userId]);
    } else if (tag !== undefined) {
      await pool.query("UPDATE media_items SET tag = $1 WHERE id = $2 AND user_id = $3", [tag, req.params.id, userId]);
    } else if (used !== undefined) {
      await pool.query("UPDATE media_items SET used = $1 WHERE id = $2 AND user_id = $3", [used, req.params.id, userId]);
    } else if (display_name !== undefined) {
      await pool.query("UPDATE media_items SET display_name = $1 WHERE id = $2 AND user_id = $3", [display_name || null, req.params.id, userId]);
    }
    invalidateMedia(userId);
    res.json({ ok: true });
  }, res);
});

app.patch("/api/media/:id/favorite", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id } = req.params;
  await withTables(async () => {
    const result = await pool.query(
      `UPDATE media_items SET is_favorite = NOT is_favorite
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_favorite`,
      [id, userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
    invalidateMedia(userId);
    res.json({ id: result.rows[0].id, isFavorite: result.rows[0].is_favorite });
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
      `SELECT id, day, caption, tags_summary, slide_count, scheduled_date, scheduled_time, media_ids, status, created_at,
              used_ai_caption, used_ai_tagging, used_video
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
      usedAICaption: r.used_ai_caption ?? false,
      usedAITagging: r.used_ai_tagging ?? false,
      usedVideo: r.used_video ?? false,
    }));
    res.json(userPostsCache[userId]);
  }, res);
});

app.get("/api/posts/export/ical", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    const result = await pool.query(
      `SELECT id, caption, tags_summary, scheduled_date, scheduled_time
       FROM approved_posts
       WHERE user_id = $1 AND status = 'scheduled' AND scheduled_date IS NOT NULL
       ORDER BY scheduled_date ASC, scheduled_time ASC`,
      [userId]
    );

    const pad = (n) => String(n).padStart(2, "0");
    const toIcalDt = (dateStr, timeStr) => {
      const [y, mo, d] = dateStr.split("-").map(Number);
      const [h, mi] = timeStr ? timeStr.split(":").map(Number) : [9, 0];
      return `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}00Z`;
    };
    const escape = (s) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

    const now = new Date();
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}Z`;

    let ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InstaFlow//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

    for (const row of result.rows) {
      const caption = row.caption || "";
      const summary = escape(caption.slice(0, 50) || "InstaFlow Post");
      const tags = row.tags_summary ? ` ${row.tags_summary}` : "";
      const description = escape(caption + tags);
      const dtstart = toIcalDt(row.scheduled_date, row.scheduled_time);
      // DTEND = DTSTART + 1 hour
      const startDate = new Date(`${row.scheduled_date}T${row.scheduled_time || "09:00"}:00Z`);
      startDate.setHours(startDate.getHours() + 1);
      const dtend = `${startDate.getFullYear()}${pad(startDate.getMonth()+1)}${pad(startDate.getDate())}T${pad(startDate.getHours())}${pad(startDate.getMinutes())}00Z`;

      ics.push(
        "BEGIN:VEVENT",
        `UID:post${row.id}@instaflow`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        "END:VEVENT"
      );
    }

    ics.push("END:VCALENDAR");

    const body = ics.join("\r\n");
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="instaflow-schedule.ics"');
    res.set("Access-Control-Allow-Origin", "*");
    res.send(body);
  }, res);
});

app.get("/api/posts/count", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    // Count ALL posts (any status) that are scheduled for the current month.
    // Use scheduled_date when set, fall back to created_at so no post escapes counting.
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM approved_posts
       WHERE user_id = $1
         AND (
           (scheduled_date IS NOT NULL
            AND EXTRACT(YEAR  FROM scheduled_date::date) = $2
            AND EXTRACT(MONTH FROM scheduled_date::date) = $3)
           OR
           (scheduled_date IS NULL
            AND EXTRACT(YEAR  FROM created_at) = $2
            AND EXTRACT(MONTH FROM created_at) = $3)
         )`,
      [userId, year, month]
    );
    res.json({ count: parseInt(result.rows[0].count, 10) });
  }, res);
});

app.post("/api/posts", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id, day, caption, tagsSummary, slideCount, scheduledDate, scheduledTime, mediaIds, status,
          usedAICaption, usedAITagging, usedVideo } = req.body;
  await withTables(async () => {
    // Duplicate media check for Pro/Agency users
    if (mediaIds && Array.isArray(mediaIds) && mediaIds.length > 0) {
      const profRow = await pool.query("SELECT plan, prevent_duplicates FROM profiles WHERE user_id = $1", [userId]);
      const prof = profRow.rows[0];
      if (prof && prof.plan !== "free" && prof.prevent_duplicates) {
        const dupCheck = await pool.query(
          `SELECT p.id FROM approved_posts p
           WHERE p.user_id = $1 AND p.id != $2
           AND (p.status = 'draft' OR p.status = 'scheduled')
           AND p.media_ids IS NOT NULL
           AND p.media_ids::jsonb ?| $3::text[]`,
          [userId, id ?? "", mediaIds]
        );
        if (dupCheck.rows.length > 0) {
          return res.status(409).json({ error: "duplicate_media", message: "One or more images are already used in another post or draft. Disable 'Prevent duplicate media' in Settings to allow this." });
        }
      }
    }
    await pool.query(
      `INSERT INTO approved_posts (id, day, caption, tags_summary, slide_count, scheduled_date, scheduled_time, media_ids, status, user_id, used_ai_caption, used_ai_tagging, used_video)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET
         day = EXCLUDED.day, caption = EXCLUDED.caption, tags_summary = EXCLUDED.tags_summary,
         slide_count = EXCLUDED.slide_count, scheduled_date = EXCLUDED.scheduled_date,
         scheduled_time = EXCLUDED.scheduled_time, media_ids = EXCLUDED.media_ids,
         status = EXCLUDED.status,
         used_ai_caption = EXCLUDED.used_ai_caption,
         used_ai_tagging = EXCLUDED.used_ai_tagging,
         used_video = EXCLUDED.used_video`,
      [id, day, caption ?? "", tagsSummary ?? "", String(slideCount ?? 1),
       scheduledDate ?? null, scheduledTime ?? null,
       mediaIds ? JSON.stringify(mediaIds) : null,
       status ?? "approved", userId,
       usedAICaption ?? false, usedAITagging ?? false, usedVideo ?? false]
    );
    invalidatePosts(userId);
    res.json({ ok: true });
  }, res);
});

app.put("/api/posts/:id", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { day, caption, tagsSummary, slideCount, scheduledDate, scheduledTime, mediaIds, status,
          usedAICaption, usedAITagging, usedVideo } = req.body;
  await withTables(async () => {
    // Duplicate media check for Pro/Agency users
    if (mediaIds && Array.isArray(mediaIds) && mediaIds.length > 0) {
      const profRow = await pool.query("SELECT plan, prevent_duplicates FROM profiles WHERE user_id = $1", [userId]);
      const prof = profRow.rows[0];
      if (prof && prof.plan !== "free" && prof.prevent_duplicates) {
        const dupCheck = await pool.query(
          `SELECT p.id FROM approved_posts p
           WHERE p.user_id = $1 AND p.id != $2
           AND (p.status = 'draft' OR p.status = 'scheduled')
           AND p.media_ids IS NOT NULL
           AND p.media_ids::jsonb ?| $3::text[]`,
          [userId, req.params.id, mediaIds]
        );
        if (dupCheck.rows.length > 0) {
          return res.status(409).json({ error: "duplicate_media", message: "One or more images are already used in another post or draft. Disable 'Prevent duplicate media' in Settings to allow this." });
        }
      }
    }
    await pool.query(
      `UPDATE approved_posts SET
         day = $1, caption = $2, tags_summary = $3,
         slide_count = $4, scheduled_date = $5,
         scheduled_time = $6, media_ids = $7,
         status = $8,
         used_ai_caption = $9, used_ai_tagging = $10, used_video = $11
       WHERE id = $12 AND user_id = $13`,
      [day, caption ?? "", tagsSummary ?? "", String(slideCount ?? 1),
       scheduledDate ?? null, scheduledTime ?? null,
       mediaIds ? JSON.stringify(mediaIds) : null,
       status ?? "approved",
       usedAICaption ?? false, usedAITagging ?? false, usedVideo ?? false,
       req.params.id, userId]
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

// ── Filter Presets ─────────────────────────────────────────────────────────────

app.get("/api/presets", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    const result = await pool.query(
      "SELECT id, name, settings FROM filter_presets WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );
    res.json(result.rows.map(r => ({ id: r.id, name: r.name, ...r.settings })));
  }, res);
});

app.post("/api/presets", requireAuth, async (req, res) => {
  const userId = req.userId;
  const { name, settings } = req.body;
  if (!name || !settings) return res.status(400).json({ error: "name and settings required" });
  await withTables(async () => {
    const count = await pool.query("SELECT COUNT(*) FROM filter_presets WHERE user_id = $1", [userId]);
    if (parseInt(count.rows[0].count) >= 5) {
      return res.status(400).json({ error: "Max 5 presets allowed" });
    }
    const result = await pool.query(
      "INSERT INTO filter_presets (user_id, name, settings) VALUES ($1, $2, $3) RETURNING id, name, settings",
      [userId, name, JSON.stringify(settings)]
    );
    const row = result.rows[0];
    res.json({ id: row.id, name: row.name, ...row.settings });
  }, res);
});

app.delete("/api/presets/:id", requireAuth, async (req, res) => {
  const userId = req.userId;
  await withTables(async () => {
    await pool.query("DELETE FROM filter_presets WHERE id = $1 AND user_id = $2", [req.params.id, userId]);
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

const VALID_TAGS = ["me","friends","pet","animal","food","drinks","outfit","gym","dj","party","city","location","outdoor","night","vibe","other"];

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

// ── Profile ───────────────────────────────────────────────────────────────────

app.get("/api/profile", requireAuth, (req, res) => withTables(async () => {
  const { rows } = await pool.query("SELECT * FROM profiles WHERE user_id = $1", [req.userId]);
  if (rows.length === 0) {
    const { rows: created } = await pool.query(
      "INSERT INTO profiles (user_id) VALUES ($1) RETURNING *", [req.userId]
    );
    return res.json(created[0]);
  }
  res.json(rows[0]);
}, res));

app.post("/api/profile", requireAuth, (req, res) => withTables(async () => {
  const { display_name, instagram_username, caption_style, language, timezone, prevent_duplicates, avatar_url, onboarding_complete } = req.body;
  const { rows } = await pool.query(`
    INSERT INTO profiles (user_id, display_name, instagram_username, caption_style, language, timezone, prevent_duplicates, avatar_url, onboarding_complete)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      instagram_username = EXCLUDED.instagram_username,
      caption_style = EXCLUDED.caption_style,
      language = EXCLUDED.language,
      timezone = EXCLUDED.timezone,
      prevent_duplicates = EXCLUDED.prevent_duplicates,
      avatar_url = EXCLUDED.avatar_url,
      onboarding_complete = EXCLUDED.onboarding_complete
    RETURNING *
  `, [req.userId, display_name ?? null, instagram_username ?? null, caption_style ?? "minimal", language ?? "en", timezone ?? "Europe/Berlin", prevent_duplicates ?? true, avatar_url ?? null, onboarding_complete ?? false]);
  res.json(rows[0]);
}, res));

// ── Delete account (full cleanup) ────────────────────────────────────────────

app.delete("/api/profile", requireAuth, async (req, res) => {
  const userId = req.userId;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  try {
    // 1. Delete Supabase Storage files: media/{userId}/ and avatars/{userId}/
    if (supabaseUrl && supabaseKey) {
      for (const bucket of ["media", "avatars"]) {
        try {
          const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ prefix: `${userId}/`, limit: 1000 }),
          });
          if (listRes.ok) {
            const files = await listRes.json();
            const names = (files || []).map((f) => `${userId}/${f.name}`).filter(Boolean);
            if (names.length > 0) {
              await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
                method: "DELETE",
                headers: {
                  "Authorization": `Bearer ${supabaseKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ prefixes: names }),
              });
            }
          }
        } catch (storageErr) {
          console.error(`Storage delete error (${bucket}):`, storageErr);
        }
      }
    }

    // 2. Delete all DB records
    await pool.query("DELETE FROM media_items WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM approved_posts WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM media_folders WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM user_settings WHERE user_id = $1", [userId]).catch(() => {});
    await pool.query("DELETE FROM profiles WHERE user_id = $1", [userId]);

    // 3. Delete from Supabase Auth (requires service role)
    if (supabaseAdmin) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Failed to delete account", detail: String(err) });
  }
});

// ── Avatar upload ─────────────────────────────────────────────────────────────

app.post("/api/profile/avatar", requireAuth, async (req, res) => {
  const { base64, mimeType } = req.body;
  if (!base64) return res.status(400).json({ error: "base64 required" });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Storage not configured" });
  try {
    const buffer = Buffer.from(base64, "base64");
    const contentType = mimeType || "image/jpeg";
    const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const path = `${req.userId}/avatar.${ext}`;
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buffer,
    });
    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      console.error("Avatar upload error:", errBody);
      return res.status(500).json({ error: "Upload failed", detail: errBody });
    }
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${path}`;
    // Save to profiles
    await pool.query(
      `INSERT INTO profiles (user_id, avatar_url) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET avatar_url = EXCLUDED.avatar_url`,
      [req.userId, publicUrl]
    );
    res.json({ url: publicUrl });
  } catch (err) {
    console.error("Avatar upload exception:", err);
    res.status(500).json({ error: "Avatar upload failed" });
  }
});

// ── Push Notification Preferences ────────────────────────────────────────────
app.post("/api/profile/notify", requireAuth, (req, res) => withTables(async () => {
  console.log('[notify-save] userId:', req.userId);
  console.log('[notify-save] body:', req.body);
  const { notify_daily, notify_time, notify_updates } = req.body;
  await pool.query(`
    INSERT INTO profiles (user_id, notify_daily, notify_time, notify_updates)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE SET
      notify_daily = EXCLUDED.notify_daily,
      notify_time = EXCLUDED.notify_time,
      notify_updates = EXCLUDED.notify_updates
  `, [req.userId, notify_daily ?? true, notify_time ?? "09:00", notify_updates ?? false]);
  res.json({ ok: true });
}, res));

// ── Push subscription endpoints ───────────────────────────────────────────────
app.post("/api/push/subscribe", requireAuth, (req, res) => withTables(async () => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: "Missing subscription" });
  await pool.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, subscription)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, endpoint) DO UPDATE SET subscription = EXCLUDED.subscription
  `, [req.userId, subscription.endpoint, JSON.stringify(subscription)]);
  res.json({ ok: true });
}, res));

app.post("/api/push/test", requireAuth, (req, res) => withTables(async () => {
  if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ error: "Push not configured" });
  const { rows } = await pool.query("SELECT subscription FROM push_subscriptions WHERE user_id = $1 LIMIT 5", [req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: "No subscriptions found" });
  const payload = JSON.stringify({ title: "InstaFlow", body: "🎉 Push notifications are working!" });
  const results = await Promise.allSettled(rows.map(row => webpush.sendNotification(row.subscription, payload)));
  const sent = results.filter(r => r.status === "fulfilled").length;
  res.json({ sent, total: rows.length });
}, res));

// ── Push notification scheduler (runs every minute) ───────────────────────────
async function sendDailyPostReminders() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  async function runCycle() {
    console.log('[notify] checking at', new Date().toISOString());
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Fetch profiles via Supabase REST API (HTTPS — more reliable than direct PG on Render Free)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    let usersToNotify = [];
    if (supabaseUrl && supabaseKey) {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/profiles?notify_daily=eq.true&select=user_id,notify_time,timezone,last_notification_sent`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      if (!resp.ok) throw new Error(`[notify] Supabase REST ${resp.status}: ${await resp.text()}`);
      usersToNotify = await resp.json();
      console.log('[notify] profiles via REST:', usersToNotify.length);
    } else {
      // Fallback: direct pool query if Supabase env vars are not set
      const { rows } = await pool.query(
        `SELECT user_id, notify_time, timezone, last_notification_sent FROM profiles WHERE notify_daily = true`
      );
      usersToNotify = rows;
      console.log('[notify] profiles via pool:', usersToNotify.length);
    }

    const messages = [
      { title: "InstaFlow 📸", body: "Ready to create your next post? Your audience is waiting!" },
      { title: "InstaFlow ✨", body: "Time to share something great today. Open InstaFlow!" },
      { title: "InstaFlow 🚀", body: "Your daily post reminder — let's create something amazing!" },
      { title: "InstaFlow 💡", body: "Got something to share? Now's the perfect time to post!" },
      { title: "InstaFlow 🎯", body: "Stay consistent! Create your post for today." },
    ];

    for (const user of usersToNotify) {
      try {
        const tz = user.timezone || "UTC";
        const userNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
        const notifyTime = user.notify_time || "09:00";
        const [targetH, targetM] = notifyTime.split(':').map(Number);
        const diffMinutes = Math.abs(
          (userNow.getHours() * 60 + userNow.getMinutes()) - (targetH * 60 + targetM)
        );
        if (diffMinutes > 1) continue;
        // Avoid duplicate notifications — only send if last sent > 23 hours ago
        const lastSent = user.last_notification_sent ? new Date(user.last_notification_sent) : null;
        if (lastSent && (now - lastSent) / (1000 * 60 * 60) < 23) continue;
        // Get their push subscriptions
        const { rows: subs } = await pool.query(
          "SELECT subscription FROM push_subscriptions WHERE user_id = $1", [user.user_id]
        );
        if (subs.length === 0) continue;
        // Pick a random motivational message
        const msg = { ...messages[Math.floor(Math.random() * messages.length)] };
        // Append today's scheduled post count if any
        const { rows: posts } = await pool.query(
          "SELECT COUNT(*) AS count FROM approved_posts WHERE user_id = $1 AND scheduled_date = $2 AND status = 'approved'",
          [user.user_id, todayStr]
        );
        const postCount = parseInt(posts[0].count, 10);
        if (postCount > 0) msg.body += ` You have ${postCount} post${postCount !== 1 ? "s" : ""} scheduled for today.`;
        console.log('[notify] sending to user:', user.user_id, '|', msg.title);
        const payload = JSON.stringify({ title: msg.title, body: msg.body });
        await Promise.allSettled(subs.map(s => webpush.sendNotification(s.subscription, payload)));
        await pool.query(
          "UPDATE profiles SET last_notification_sent = NOW() WHERE user_id = $1", [user.user_id]
        );
      } catch (userErr) {
        console.error("[notify] error for user:", user.user_id, userErr.message);
      }
    }
  }

  // DNS-aware outer wrapper: retry once after 30 s on EAI_AGAIN / ENOTFOUND
  try {
    await runCycle();
  } catch (err) {
    const isDns = err.message && (err.message.includes('EAI_AGAIN') || err.message.includes('ENOTFOUND'));
    if (isDns) {
      console.log('[notify] DNS error, retrying in 30 s:', err.message);
      await new Promise(r => setTimeout(r, 30000));
      try {
        await runCycle();
      } catch (retryErr) {
        console.log('[notify] retry also failed, skipping cycle:', retryErr.message);
      }
    } else {
      console.log('[notify] scheduler error (non-fatal):', err.message);
    }
  }
}

// ── Recommended Posting Schedule ─────────────────────────────────────────────
//
// TODO: When Instagram API is connected, replace best-practice scores with
// real engagement data:
//   - Fetch post insights (reach, likes, comments) per post
//   - Update engagement_score in posting_schedule table
//   - ML model will learn user's personal best times

function getBestPracticeScore(dayOfWeek, hour) {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (!isWeekend) {
    if (hour >= 18 && hour <= 21) return 1.0;
    if (hour >= 11 && hour <= 13) return 0.8;
    if (hour >= 9  && hour <= 10) return 0.6;
    if (hour >= 7  && hour <=  8) return 0.4;
    return 0.3;
  } else {
    if (hour >= 10 && hour <= 12) return 0.9;
    if (hour >= 15 && hour <= 18) return 0.7;
    if (hour >= 13 && hour <= 14) return 0.55;
    return 0.35;
  }
}

function scoreLabel(score) {
  if (score >= 0.8) return "Great time";
  if (score >= 0.6) return "Good time";
  if (score >= 0.4) return "Okay time";
  return "Low engagement";
}

function scoreEmoji(score) {
  if (score >= 0.8) return "⚡";
  if (score >= 0.6) return "👍";
  if (score >= 0.4) return "😐";
  return "😴";
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

app.get("/api/schedule/recommendations", requireAuth, (req, res) => withTables(async () => {
  const userId = req.userId;
  const now = new Date();
  const todayDow = now.getDay();

  // Get user's own posting history to weight scores
  const { rows: userHistory } = await pool.query(`
    SELECT
      EXTRACT(DOW FROM (scheduled_date::date)) AS dow,
      EXTRACT(HOUR FROM (scheduled_time::time)) AS hr,
      COUNT(*) AS cnt
    FROM approved_posts
    WHERE user_id = $1
      AND scheduled_date IS NOT NULL
      AND scheduled_time IS NOT NULL
    GROUP BY 1, 2
  `, [userId]);

  const userScoreMap = {};
  let maxUserCount = 1;
  for (const row of userHistory) {
    const key = `${row.dow}_${row.hr}`;
    userScoreMap[key] = parseInt(row.cnt, 10);
    maxUserCount = Math.max(maxUserCount, userScoreMap[key]);
  }

  // Build the best slot for each of the 7 days, ensuring full-week coverage
  const bestPerDay = [];
  for (let dow = 0; dow < 7; dow++) {
    let bestSlot = null;
    for (let hour = 7; hour <= 22; hour++) {
      const base = getBestPracticeScore(dow, hour);
      const userWeight = (userScoreMap[`${dow}_${hour}`] ?? 0) / maxUserCount;
      // Blend: best-practice 60%, user history 40%
      const combined = Math.min(1.0, base * 0.6 + userWeight * 0.4);
      const daysFromToday = (dow - todayDow + 7) % 7;
      if (!bestSlot || combined > bestSlot.score) {
        bestSlot = { dayOfWeek: dow, hour, score: combined, daysFromToday };
      }
    }
    if (bestSlot) bestPerDay.push(bestSlot);
  }

  // Sort the 7 day-winners by score desc, take top 5 (always spans 5 different days)
  const top5 = bestPerDay.sort((a, b) => b.score - a.score).slice(0, 5);

  const result = top5.map((slot) => ({
    dayOfWeek: slot.dayOfWeek,
    hour: slot.hour,
    score: Math.round(slot.score * 100) / 100,
    label: `${DAY_NAMES[slot.dayOfWeek]} ${String(slot.hour).padStart(2, "0")}:00 — ${scoreLabel(slot.score)}`,
    emoji: scoreEmoji(slot.score),
    daysFromToday: slot.daysFromToday,
  }));

  res.json(result);
}, res));

app.get("/api/schedule/score", requireAuth, (req, res) => withTables(async () => {
  const { date, time } = req.query;
  if (!date || !time) return res.status(400).json({ error: "date and time required" });
  const dt = new Date(`${date}T${time}:00`);
  if (isNaN(dt.getTime())) return res.status(400).json({ error: "invalid date/time" });
  const dow = dt.getDay();
  const hour = dt.getHours();
  const score = getBestPracticeScore(dow, hour);
  const label = scoreLabel(score);
  const emoji = scoreEmoji(score);

  let suggestion = null;
  if (score < 0.8) {
    const isWeekend = dow === 0 || dow === 6;
    suggestion = isWeekend
      ? "Try 10:00–12:00 for better engagement"
      : "Try 18:00–21:00 for best engagement";
  }

  res.json({ score: Math.round(score * 100) / 100, label, emoji, suggestion });
}, res));

app.post("/api/schedule/analytics", requireAuth, (req, res) => withTables(async () => {
  const { dayOfWeek, hour } = req.body;
  if (dayOfWeek == null || hour == null) return res.status(400).json({ error: "dayOfWeek and hour required" });
  const userId = req.userId;
  const score = getBestPracticeScore(dayOfWeek, hour);
  await pool.query(`
    INSERT INTO posting_schedule (user_id, day_of_week, hour, engagement_score, post_count)
    VALUES ($1, $2, $3, $4, 1)
    ON CONFLICT DO NOTHING
  `, [userId, dayOfWeek, hour, score]);
  await pool.query(`
    UPDATE posting_schedule
    SET post_count = post_count + 1, engagement_score = $4
    WHERE user_id = $1 AND day_of_week = $2 AND hour = $3
  `, [userId, dayOfWeek, hour, score]);
  res.json({ ok: true });
}, res));

// ── Analytics endpoints ───────────────────────────────────────────────────────
function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

app.get("/api/analytics/overview", requireAuth, (req, res) => withTables(async () => {
  const userId = req.userId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];
  const [posts, media, folders, drafts, scheduled, posted] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM approved_posts WHERE user_id=$1 AND DATE(created_at) >= $2`, [userId, monthStart]),
    pool.query(`SELECT COUNT(*) FROM media_items WHERE user_id=$1`, [userId]),
    pool.query(`SELECT COUNT(*) FROM media_folders WHERE user_id=$1`, [userId]),
    pool.query(`SELECT COUNT(*) FROM approved_posts WHERE user_id=$1 AND status='draft'`, [userId]),
    pool.query(`SELECT COUNT(*) FROM approved_posts WHERE user_id=$1 AND status IN ('approved','scheduled') AND scheduled_date >= $2`, [userId, today]),
    pool.query(`SELECT COUNT(*) FROM approved_posts WHERE user_id=$1 AND status='posted' AND DATE(created_at) >= $2`, [userId, monthStart]),
  ]);
  res.json({
    postsThisMonth: parseInt(posts.rows[0].count),
    mediaCount: parseInt(media.rows[0].count),
    folderCount: parseInt(folders.rows[0].count),
    draftCount: parseInt(drafts.rows[0].count),
    scheduledCount: parseInt(scheduled.rows[0].count),
    postedThisMonth: parseInt(posted.rows[0].count),
  });
}, res));

app.get("/api/analytics/posting-frequency", requireAuth, (req, res) => withTables(async () => {
  const { rows } = await pool.query(`
    SELECT DATE_TRUNC('week', created_at) AS week_start, COUNT(*) AS count
    FROM approved_posts
    WHERE user_id=$1 AND created_at >= NOW() - INTERVAL '28 days'
    GROUP BY week_start ORDER BY week_start
  `, [req.userId]);
  res.json(rows.map(r => ({ week: "CW " + getISOWeek(r.week_start), count: parseInt(r.count) })));
}, res));

app.get("/api/analytics/tag-distribution", requireAuth, (req, res) => withTables(async () => {
  const { rows } = await pool.query(
    `SELECT tags_summary FROM approved_posts WHERE user_id=$1 AND tags_summary != ''`, [req.userId]
  );
  const counts = {};
  for (const r of rows) {
    r.tags_summary.split(",").map(t => t.trim()).filter(Boolean).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count }));
  res.json(sorted);
}, res));

app.get("/api/analytics/posting-times", requireAuth, (req, res) => withTables(async () => {
  const { rows } = await pool.query(`
    SELECT
      EXTRACT(DOW FROM scheduled_date::date) AS day_of_week,
      CAST(SPLIT_PART(scheduled_time, ':', 1) AS INT) AS hour,
      COUNT(*) AS count
    FROM approved_posts
    WHERE user_id=$1
      AND scheduled_date IS NOT NULL AND scheduled_date != ''
      AND scheduled_time IS NOT NULL AND scheduled_time != ''
    GROUP BY day_of_week, hour ORDER BY day_of_week, hour
  `, [req.userId]);
  res.json(rows.map(r => ({ dayOfWeek: parseInt(r.day_of_week), hour: parseInt(r.hour), count: parseInt(r.count) })));
}, res));

app.get("/api/analytics/content-mix", requireAuth, (req, res) => withTables(async () => {
  const [mediaRows, slideRows] = await Promise.all([
    pool.query(`SELECT media_type, COUNT(*) AS count FROM media_items WHERE user_id=$1 GROUP BY media_type`, [req.userId]),
    pool.query(`SELECT AVG(CAST(NULLIF(slide_count,'') AS FLOAT)) AS avg FROM approved_posts WHERE user_id=$1`, [req.userId]),
  ]);
  let imageCount = 0, videoCount = 0;
  for (const r of mediaRows.rows) {
    if (r.media_type === "video") videoCount += parseInt(r.count);
    else imageCount += parseInt(r.count);
  }
  res.json({ imageCount, videoCount, avgSlides: parseFloat(slideRows.rows[0]?.avg || 1).toFixed(1) });
}, res));

app.get("/api/analytics/trending-tags", requireAuth, (req, res) => withTables(async () => {
  const TRENDING = ["lifestyle", "food", "fitness", "travel", "fashion", "music", "pets", "city", "night", "friends"];
  const { rows } = await pool.query(
    `SELECT tags_summary FROM approved_posts WHERE user_id=$1 AND tags_summary != ''`, [req.userId]
  );
  const userTags = new Set();
  rows.forEach(r => r.tags_summary.split(",").map(t => t.trim().toLowerCase()).filter(Boolean).forEach(t => userTags.add(t)));
  res.json(TRENDING.map(tag => ({ tag, trending: true, userHasTag: userTags.has(tag) })));
}, res));

// ── Stripe API endpoints ───────────────────────────────────────────────────────
app.post("/api/stripe/create-checkout", requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });
  const { plan, period } = req.body;
  if (!plan || !period) return res.status(400).json({ error: "plan and period required" });

  console.log("[stripe] create-checkout called:", { plan, period, userId: req.userId });
  console.log("[stripe] price IDs:", {
    proMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    proYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
    agencyMonthly: process.env.STRIPE_AGENCY_MONTHLY_PRICE_ID,
    agencyYearly: process.env.STRIPE_AGENCY_YEARLY_PRICE_ID,
  });

  try {
    const { rows } = await pool.query("SELECT stripe_customer_id, display_name FROM profiles WHERE user_id = $1", [req.userId]);
    let customerId = rows[0]?.stripe_customer_id;

    if (!customerId) {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(req.userId);
      const customer = await stripe.customers.create({
        email: user?.email,
        name: rows[0]?.display_name || user?.email,
        metadata: { user_id: req.userId },
      });
      customerId = customer.id;
      await pool.query("UPDATE profiles SET stripe_customer_id = $1 WHERE user_id = $2", [customerId, req.userId]);
    }

    const priceMap = {
      pro_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
      agency_monthly: process.env.STRIPE_AGENCY_MONTHLY_PRICE_ID,
      agency_yearly: process.env.STRIPE_AGENCY_YEARLY_PRICE_ID,
    };
    const priceId = priceMap[`${plan}_${period}`];
    if (!priceId) return res.status(400).json({ error: `No price ID configured for ${plan}_${period} — add STRIPE_${plan.toUpperCase()}_${period.toUpperCase()}_PRICE_ID to Render env vars.` });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: "https://instaflow-web-app.vercel.app?upgrade=success",
      cancel_url: "https://instaflow-web-app.vercel.app?upgrade=cancelled",
      metadata: { user_id: req.userId },
    });
    console.log("[stripe] checkout session created:", session.id);
    res.json({ url: session.url });
  } catch (err) {
    console.log("[stripe] create-checkout error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stripe/create-portal", requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });
  const { rows } = await pool.query("SELECT stripe_customer_id FROM profiles WHERE user_id = $1", [req.userId]);
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) return res.status(400).json({ error: "No Stripe customer found — please subscribe first." });
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: "https://instaflow-web-app.vercel.app",
  });
  res.json({ url: session.url });
});

app.get("/api/stripe/subscription", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT plan, stripe_subscription_id, subscription_status, subscription_period FROM profiles WHERE user_id = $1",
    [req.userId]
  );
  if (!rows.length) return res.json({ plan: "free", status: "inactive", period: "monthly", nextBillingDate: null });
  const row = rows[0];
  let nextBillingDate = null;
  if (stripe && row.stripe_subscription_id && row.subscription_status === "active") {
    try {
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      nextBillingDate = new Date(sub.current_period_end * 1000).toISOString().split("T")[0];
    } catch (e) { /* subscription may have been deleted externally */ }
  }
  res.json({
    plan: row.plan || "free",
    status: row.subscription_status || "inactive",
    period: row.subscription_period || "monthly",
    nextBillingDate,
  });
});

async function ensureAvatarsBucket() {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.storage.createBucket("avatars", { public: true });
    console.log("avatars bucket ready");
  } catch (err) {
    // Bucket may already exist — not an error
  }
}

// ── Instagram Auto-Posting ─────────────────────────────────────────────────────
const IG_API_BASE    = "https://graph.facebook.com/v19.0";
// Facebook App ID (used for OAuth) — always 958270167021272, NOT the Instagram App ID
const IG_APP_ID      = process.env.FACEBOOK_APP_ID || "958270167021272";
const IG_APP_SECRET  = process.env.INSTAGRAM_APP_SECRET;
const IG_REDIRECT    = "https://instaflow-api.onrender.com/api/instagram/callback";

// Let — updated in-memory when OAuth callback saves a fresh token
let IG_TOKEN    = process.env.INSTAGRAM_ACCESS_TOKEN || null;
let IG_USER_ID  = process.env.INSTAGRAM_USER_ID || null;

// Load persisted credentials from app_settings (overrides env vars if present)
async function loadIgCredentials() {
  try {
    const { rows } = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('ig_access_token', 'ig_user_id')"
    );
    for (const r of rows) {
      if (r.key === "ig_access_token" && r.value) { IG_TOKEN = r.value; console.log("[ig] access token loaded from DB"); }
      if (r.key === "ig_user_id"      && r.value) { IG_USER_ID = r.value; console.log("[ig] user_id loaded from DB:", r.value); }
    }
  } catch (err) {
    console.error("[ig] loadIgCredentials error:", err.message);
  }
}

async function saveIgCredentials(token, userId) {
  await pool.query(
    "INSERT INTO app_settings (key, value) VALUES ('ig_access_token', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [token]
  );
  await pool.query(
    "INSERT INTO app_settings (key, value) VALUES ('ig_user_id', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [userId]
  );
  IG_TOKEN   = token;
  IG_USER_ID = userId;
  igLog(`Credentials saved — user_id=${userId}`);
}

async function igPost(path, params) {
  const res = await fetch(`${IG_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: IG_TOKEN, ...params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`IG API: ${data.error.message} (code ${data.error.code})`);
  return data;
}

async function igGet(path, params = {}) {
  const url = new URL(`${IG_API_BASE}${path}`);
  url.searchParams.set("access_token", IG_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(`IG API: ${data.error.message} (code ${data.error.code})`);
  return data;
}

async function waitForIgVideo(creationId, maxWaitMs = 300_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const data = await igGet(`/${creationId}`, { fields: "status_code,status" });
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") throw new Error(`IG video processing error: ${data.status}`);
    await new Promise(r => setTimeout(r, 8000));
  }
  throw new Error("IG video processing timed out (>5 min)");
}

function isIgVideo(mediaType) {
  return (mediaType || "").startsWith("video");
}

async function publishPostToInstagram(post, mediaItems) {
  if (!IG_TOKEN || !IG_USER_ID) throw new Error("Instagram credentials not configured (INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID missing)");
  const caption = post.caption || "";
  const items = mediaItems.filter(m => m.url && m.url.startsWith("http"));
  if (items.length === 0) throw new Error("No public media URLs found for this post");

  if (items.length === 1) {
    const item = items[0];
    if (isIgVideo(item.media_type)) {
      // ── Reel ──────────────────────────────────────────────────────────────
      console.log(`[ig] Creating Reel for post ${post.id}: ${item.url.substring(0, 80)}`);
      const container = await igPost(`/${IG_USER_ID}/media`, {
        media_type: "REELS",
        video_url: item.url,
        caption,
        share_to_feed: true,
      });
      await waitForIgVideo(container.id);
      const result = await igPost(`/${IG_USER_ID}/media_publish`, { creation_id: container.id });
      console.log(`[ig] Reel published, ig_id=${result.id}`);
      return result.id;
    } else {
      // ── Single Image ───────────────────────────────────────────────────────
      console.log(`[ig] Creating single image post for ${post.id}`);
      const container = await igPost(`/${IG_USER_ID}/media`, {
        image_url: item.url,
        caption,
      });
      const result = await igPost(`/${IG_USER_ID}/media_publish`, { creation_id: container.id });
      console.log(`[ig] Image post published, ig_id=${result.id}`);
      return result.id;
    }
  } else {
    // ── Carousel ─────────────────────────────────────────────────────────────
    console.log(`[ig] Creating carousel (${items.length} items) for post ${post.id}`);
    const childIds = [];
    for (const item of items) {
      if (isIgVideo(item.media_type)) {
        const child = await igPost(`/${IG_USER_ID}/media`, {
          media_type: "VIDEO",
          video_url: item.url,
          is_carousel_item: true,
        });
        await waitForIgVideo(child.id);
        childIds.push(child.id);
      } else {
        const child = await igPost(`/${IG_USER_ID}/media`, {
          image_url: item.url,
          is_carousel_item: true,
        });
        childIds.push(child.id);
      }
    }
    const container = await igPost(`/${IG_USER_ID}/media`, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
    });
    const result = await igPost(`/${IG_USER_ID}/media_publish`, { creation_id: container.id });
    console.log(`[ig] Carousel published, ig_id=${result.id}, children=${childIds.length}`);
    return result.id;
  }
}

// Returns true if the post is due in the user's local timezone
function isIgPostDue(scheduledDate, scheduledTime, timezone) {
  try {
    const time = scheduledTime || "09:00";
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = {};
    for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
    const nowDate = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = parts.hour === "24" ? "00" : parts.hour;
    const nowTime = `${hour}:${parts.minute}`;
    return nowDate > scheduledDate || (nowDate === scheduledDate && nowTime >= time);
  } catch {
    return false;
  }
}

// ── Scheduler activity log (in-memory, last 50 entries) ───────────────────────
const igSchedulerLog = [];
let igSchedulerInitTime = null;
let igSchedulerLastTickTime = null;
function igLog(msg) {
  const entry = { ts: new Date().toISOString(), msg };
  igSchedulerLog.push(entry);
  if (igSchedulerLog.length > 50) igSchedulerLog.shift();
  console.log(`[ig-scheduler] ${msg}`);
}

let igSchedulerRunning = false;
async function runInstagramScheduler() {
  if (!IG_TOKEN || !IG_USER_ID) {
    igLog(`Skipped — env vars missing (token=${!!IG_TOKEN}, userId=${!!IG_USER_ID})`);
    return;
  }
  if (igSchedulerRunning) {
    igLog("Skipped — previous run still in progress");
    return;
  }
  igSchedulerRunning = true;
  igSchedulerLastTickTime = new Date().toISOString();
  try {
    const { rows: scheduledPosts } = await pool.query(`
      SELECT p.id, p.caption, p.slide_count, p.scheduled_date, p.scheduled_time,
             p.media_ids, p.user_id, pr.timezone
      FROM approved_posts p
      LEFT JOIN profiles pr ON pr.user_id = p.user_id
      WHERE p.status IN ('scheduled', 'approved') AND p.scheduled_date IS NOT NULL
    `);

    const due = scheduledPosts.filter(p =>
      isIgPostDue(p.scheduled_date, p.scheduled_time, p.timezone || "UTC")
    );

    igLog(`Tick — ${scheduledPosts.length} candidate(s), ${due.length} due`);

    for (const post of due) {
      // Atomically claim the post to prevent double-posting
      const claim = await pool.query(
        "UPDATE approved_posts SET status = 'posting' WHERE id = $1 AND status IN ('scheduled', 'approved') RETURNING id",
        [post.id]
      );
      if (claim.rowCount === 0) { igLog(`Post ${post.id} already claimed — skipping`); continue; }

      igLog(`Publishing post ${post.id} (user ${post.user_id})`);
      try {
        const mediaIds = post.media_ids ? JSON.parse(post.media_ids) : [];
        let mediaItems = [];
        if (mediaIds.length > 0) {
          const { rows } = await pool.query(
            `SELECT id, url, media_type, thumbnail_url FROM media_items WHERE id = ANY($1) AND user_id = $2`,
            [mediaIds, post.user_id]
          );
          const byId = new Map(rows.map(m => [m.id, m]));
          mediaItems = mediaIds.map(id => byId.get(id)).filter(Boolean);
        }

        const igPostId = await publishPostToInstagram(post, mediaItems);

        await pool.query(
          `UPDATE approved_posts SET status = 'posted', instagram_post_id = $1, posted_at = NOW(), post_error = NULL WHERE id = $2`,
          [igPostId, post.id]
        );
        delete userPostsCache[post.user_id];
        igLog(`✓ Post ${post.id} → IG ${igPostId}`);
      } catch (err) {
        igLog(`✗ Post ${post.id} failed: ${err.message}`);
        await pool.query(
          `UPDATE approved_posts SET status = 'failed', post_error = $1 WHERE id = $2`,
          [err.message.substring(0, 500), post.id]
        );
        delete userPostsCache[post.user_id];
      }
    }
  } catch (err) {
    igLog(`Scheduler error: ${err.message}`);
  } finally {
    igSchedulerRunning = false;
  }
}

// ── OAuth: return the URL the user must open in their browser ─────────────────
app.get("/api/instagram/auth-url", async (req, res) => {
  const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  url.searchParams.set("client_id", IG_APP_ID);
  url.searchParams.set("redirect_uri", IG_REDIRECT);
  url.searchParams.set("scope", [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
  ].join(","));
  url.searchParams.set("response_type", "code");
  const authUrl = url.toString();

  // If the request comes from a browser (Accept: text/html), redirect directly to Facebook.
  // API/JSON clients receive the URL as before.
  const acceptsHtml = (req.headers.accept || "").includes("text/html");
  if (acceptsHtml) {
    return res.redirect(authUrl);
  }
  res.json({ auth_url: authUrl });
});

// ── OAuth: Meta redirects here with ?code=... ─────────────────────────────────
app.get("/api/instagram/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`<h2>OAuth Error</h2><p>${error}: ${error_description}</p>`);
  }
  if (!code) {
    const receivedParams = JSON.stringify(req.query, null, 2);
    const noParams = Object.keys(req.query).length === 0;
    return res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Instagram OAuth</title>
      <style>
        body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; color: #333; }
        h2 { color: #d00; }
        code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        pre { background: #f5f5f5; padding: 12px; border-radius: 6px; }
        .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #1877f2; color: #fff;
               text-decoration: none; border-radius: 8px; font-size: 1em; font-weight: 600; }
        .warn { background: #fff8e1; border-left: 4px solid #f9a825; padding: 12px 16px; border-radius: 4px; margin: 16px 0; }
      </style></head><body>
      <h2>OAuth Callback: Missing <code>code</code> Parameter</h2>

      ${noParams ? `
      <div class="warn">
        <strong>No query parameters were received.</strong><br>
        This means you navigated directly to this URL instead of going through the Facebook login flow.<br>
        Please click the button below to start the OAuth flow correctly.
      </div>` : `
      <p>Facebook redirected back without an authorization code. Possible reasons:</p>
      <ul>
        <li>The <strong>redirect URI</strong> in your Facebook App Dashboard doesn't exactly match:<br>
          <code>${IG_REDIRECT}</code></li>
        <li>The user denied the permission dialog</li>
        <li>The app is in <strong>Development Mode</strong> — the Facebook account must be added as a Tester
            in the App Dashboard under <em>Roles → Test Users</em></li>
        <li>Wrong Facebook App ID (currently using: <code>${IG_APP_ID}</code>)</li>
      </ul>`}

      <p><strong>Query parameters received:</strong></p>
      <pre>${receivedParams || "(none)"}</pre>

      <a class="btn" href="/api/instagram/auth-url">▶ Start Facebook Login →</a>
      </body></html>
    `);
  }
  if (!IG_APP_SECRET) {
    return res.status(500).send("<h2>INSTAGRAM_APP_SECRET not set on server</h2>");
  }

  try {
    // 1 ── Short-lived token
    const tokenRes = await fetch(`${IG_API_BASE}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: IG_APP_ID,
        client_secret: IG_APP_SECRET,
        redirect_uri: IG_REDIRECT,
        code,
      }).toString(),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(`Token exchange: ${tokenData.error.message} (code ${tokenData.error.code})`);
    const shortToken = tokenData.access_token;

    // 2 ── Long-lived token (60 days)
    const longRes = await fetch(
      `${IG_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${IG_APP_ID}&client_secret=${IG_APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortToken)}`
    );
    const longData = await longRes.json();
    if (longData.error) throw new Error(`Long-lived exchange: ${longData.error.message} (code ${longData.error.code})`);
    const longToken = longData.access_token;
    const expiresIn = longData.expires_in; // seconds (~5184000 = 60 days)

    // 3 ── Discover connected Instagram Business Account ID
    const pagesRes = await fetch(
      `${IG_API_BASE}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(longToken)}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(`Pages lookup: ${pagesData.error.message} (code ${pagesData.error.code})`);

    let igUserId = null;
    let igUsername = null;
    for (const page of (pagesData.data || [])) {
      if (page.instagram_business_account?.id) {
        igUserId = page.instagram_business_account.id;
        igUsername = page.instagram_business_account.username;
        break;
      }
    }

    if (!igUserId) {
      return res.status(400).send(
        `<h2>No Instagram Business Account found</h2>
         <p>Make sure your Instagram account is a <strong>Professional (Creator or Business)</strong> account
         and is linked to the Facebook Page you authorised.</p>
         <pre>${JSON.stringify(pagesData, null, 2)}</pre>`
      );
    }

    // 4 ── Persist to DB + update in-memory vars
    await saveIgCredentials(longToken, igUserId);

    const expiryDays = Math.round((expiresIn || 5184000) / 86400);
    console.log(`[ig-oauth] Success — @${igUsername} (${igUserId}), token valid ~${expiryDays} days`);

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>body{font-family:sans-serif;max-width:500px;margin:60px auto;text-align:center}
      h1{color:#10b981}p{color:#444}code{background:#f3f4f6;padding:2px 6px;border-radius:4px}</style></head>
      <body>
        <h1>✓ Instagram connected</h1>
        <p>Account: <strong>@${igUsername}</strong> (ID: <code>${igUserId}</code>)</p>
        <p>Token is valid for approximately <strong>${expiryDays} days</strong>.</p>
        <p>InstaFlow will now automatically post your scheduled content. You can close this tab.</p>
      </body></html>`);
  } catch (err) {
    console.error("[ig-oauth] callback error:", err.message);
    res.status(500).send(`<h2>OAuth failed</h2><pre>${err.message}</pre>`);
  }
});

// Manual trigger for testing / debugging
app.post("/api/instagram/trigger", requireAuth, async (req, res) => {
  try {
    await runInstagramScheduler();
    res.json({ ok: true, message: "Scheduler triggered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Status check — returns IG account info to verify credentials
app.get("/api/instagram/status", requireAuth, async (req, res) => {
  if (!IG_TOKEN || !IG_USER_ID) {
    return res.json({ configured: false, reason: "INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID not set" });
  }
  try {
    const data = await igGet(`/${IG_USER_ID}`, { fields: "id,name,username" });
    res.json({ configured: true, account: data });
  } catch (err) {
    res.json({ configured: true, error: err.message });
  }
});

// Public debug endpoint — no auth required
app.get("/api/instagram/debug", async (req, res) => {
  try {
    const now = new Date();
    const todayUtc = now.toISOString().slice(0, 10);

    // Posts due today (scheduled_date = today server UTC, status in scheduled/approved)
    const { rows: todayPosts } = await pool.query(`
      SELECT p.id, p.caption, p.slide_count, p.scheduled_date, p.scheduled_time,
             p.status, p.instagram_post_id, p.posted_at, p.post_error,
             p.media_ids, p.user_id, pr.timezone
      FROM approved_posts p
      LEFT JOIN profiles pr ON pr.user_id = p.user_id
      WHERE p.scheduled_date = $1
        AND p.status IN ('scheduled', 'approved', 'posting', 'posted', 'failed')
      ORDER BY p.scheduled_time ASC NULLS LAST
    `, [todayUtc]);

    // For each post also evaluate isPostDue
    const postsWithDue = todayPosts.map(p => ({
      id: p.id,
      status: p.status,
      scheduled_date: p.scheduled_date,
      scheduled_time: p.scheduled_time,
      timezone: p.timezone || "UTC",
      slide_count: p.slide_count,
      media_ids_count: p.media_ids ? JSON.parse(p.media_ids).length : 0,
      instagram_post_id: p.instagram_post_id || null,
      posted_at: p.posted_at || null,
      post_error: p.post_error || null,
      is_due_now: isIgPostDue(p.scheduled_date, p.scheduled_time, p.timezone || "UTC"),
      caption_preview: (p.caption || "").substring(0, 60),
    }));

    res.json({
      server_time_utc: now.toISOString(),
      server_time_local: now.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
      instagram_token_set: !!IG_TOKEN,
      instagram_user_id_set: !!IG_USER_ID,
      instagram_user_id: IG_USER_ID || null,
      scheduler_initialized_at: igSchedulerInitTime,
      scheduler_last_tick: igSchedulerLastTickTime,
      scheduler_currently_running: igSchedulerRunning,
      scheduler_log_last_20: igSchedulerLog.slice(-20),
      posts_today_db: postsWithDue,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function startIgScheduler() {
  if (IG_TOKEN && IG_USER_ID) {
    igSchedulerInitTime = new Date().toISOString();
    igLog(`Scheduler initialized — starting first run immediately`);
    runInstagramScheduler();
    setInterval(runInstagramScheduler, 60 * 1000);
    console.log(`[ig] Auto-posting enabled for user_id=${IG_USER_ID}`);
  } else {
    console.warn("[ig] No Instagram credentials — auto-posting disabled. Visit /api/instagram/auth-url to connect.");
    igLog(`NOT started — token=${!!IG_TOKEN}, userId=${!!IG_USER_ID}`);
    // Still register the interval — credentials may arrive via OAuth later
    setInterval(runInstagramScheduler, 60 * 1000);
  }
}

app.listen(PORT, async () => {
  console.log(`InstaFlow server running on port ${PORT}`);
  console.log(`Supabase auth: ${supabaseAdmin ? "configured" : "NOT configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY"}`);
  ensureAvatarsBucket();
  // Push notification scheduler
  setInterval(sendDailyPostReminders, 60 * 1000);
  // Load IG credentials from DB (may override env vars with fresher OAuth token)
  await loadIgCredentials();
  // Instagram auto-posting scheduler — fire immediately, then every minute
  startIgScheduler();
  // Keep-alive ping every 14 minutes to prevent Render free tier from sleeping
  const SELF_URL = 'https://instaflow-api.onrender.com/api/healthz';
  setInterval(async () => {
    try {
      await fetch(SELF_URL);
      console.log('[keep-alive] pinged successfully');
    } catch (err) {
      console.log('[keep-alive] ping failed:', err.message);
    }
  }, 14 * 60 * 1000);
});
