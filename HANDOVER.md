# InstaFlow — Project Handover Document

> Dark-themed Instagram content workflow SPA. All data is persisted in PostgreSQL.

---

## 1. Database Table Schemas

All tables are created automatically on first boot via `ensureTables()` in `artifacts/api-server/src/routes/media.ts`. The schema uses plain SQL (not Drizzle migrations).

### `media_items`
Stores every uploaded image in the Media Pool.

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT` | Primary key. Client-generated nanoid. |
| `name` | `TEXT NOT NULL` | Original file name. |
| `tag` | `TEXT` | Auto-assigned or user-set tag (e.g. `"me"`, `"🏖️ Beach"`). |
| `data_url` | `TEXT NOT NULL` | Full base64 data URL of the image. Videos are blocked. |
| `used` | `BOOLEAN NOT NULL DEFAULT FALSE` | Marked `true` after the image is included in an approved post. |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Upload timestamp. |

---

### `app_settings`
Key-value store for all user preferences and AI settings.

| Column | Type | Notes |
|---|---|---|
| `key` | `TEXT` | Primary key. String identifier for the setting. |
| `value` | `TEXT NOT NULL` | JSON-serialised or plain string value. |

**Settings keys stored:**

| Key | Format | Description |
|---|---|---|
| `captionSettings` | JSON | `CaptionSettings` object (tone, hashtags, maxLength, customInstructions, captionPrompt) |
| `preferredTags` | JSON array | Tags the AI prioritises when selecting carousel images |
| `customTags` | JSON array | User-defined tags in `"🏖️ Beach"` format |
| `hiddenBaseTags` | JSON array | Base tags the user has hidden from the picker |
| `aiCustomPreferences` | string | Free-text carousel AI instructions |
| `carouselSize` | `"random"` or number | Number of slides the AI targets |
| `slideOrderRule` | `"tag-sequence"` \| `"ai-free"` | How AI orders carousel slides |
| `tagSequence` | JSON array | Ordered list of tags for `"tag-sequence"` rule |
| `notificationTime` | `"HH:MM"` | Daily reminder time |
| `defaultScheduleTime` | `"HH:MM"` | Pre-filled post schedule time |
| `instagramUsername` | string | Shown in Settings header |

---

### `approved_posts`
Stores both approved (scheduled) posts and saved drafts. Differentiated by `status`.

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT` | Primary key. Client-generated nanoid. |
| `day` | `TEXT NOT NULL` | ISO date string `"YYYY-MM-DD"` — the scheduled date. |
| `caption` | `TEXT NOT NULL DEFAULT ''` | Final caption text. |
| `tags_summary` | `TEXT NOT NULL DEFAULT ''` | Emoji summary of tags used (display only). |
| `slide_count` | `TEXT NOT NULL DEFAULT '1'` | Number of slides (stored as text, parsed as int). |
| `scheduled_date` | `TEXT` | ISO date for scheduling. Same as `day` for approved posts. |
| `scheduled_time` | `TEXT` | Time string `"HH:MM"`. |
| `media_ids` | `TEXT` | JSON-serialised array of `media_items.id` strings. |
| `status` | `TEXT DEFAULT 'approved'` | `"approved"` or `"draft"`. |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Creation timestamp. |

---

### `media_folders`
Groups of media items the user organises into named folders.

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT` | Primary key. Client-generated nanoid. |
| `name` | `TEXT NOT NULL` | User-defined folder name. |
| `media_ids` | `TEXT` | JSON-serialised array of `media_items.id` strings. |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Creation timestamp. |

---

## 2. API Endpoints

Base path: `/api`. All requests and responses use `application/json`. Body size limit: **50 MB** (to support base64 images).

### Health

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/healthz` | Returns `{ status: "ok" }`. Used for uptime checks. |

---

### Media

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/media?page=N` | Returns a paginated page of media items (page size 20). Response: `{ items[], hasMore, total, page }`. Images only — videos are filtered out. Results are cached in memory and invalidated on write. |
| `POST` | `/api/media` | Upload a new media item. Body: `{ id, name, tag, dataUrl, used }`. Returns `400 VIDEO_NOT_SUPPORTED` if `dataUrl` starts with `data:video/`. Uses `ON CONFLICT DO NOTHING` — duplicate IDs are silently ignored. |
| `PATCH` | `/api/media/:id` | Update `tag` and/or `used` on an existing item. Body: `{ tag?, used? }`. |
| `DELETE` | `/api/media/:id` | Permanently delete a media item from the pool. |

---

### Settings

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/settings` | Returns all settings as a flat `Record<string, string>` object. Cached in memory. |
| `PUT` | `/api/settings/:key` | Upsert a single setting. Body: `{ value: string }`. Uses `ON CONFLICT DO UPDATE`. |

---

### Posts & Drafts

Both approved posts and drafts share the same table and endpoints, differentiated by `status`.

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/posts` | Returns all posts ordered by `created_at DESC`. Both approved and draft records are returned. |
| `POST` | `/api/posts` | Create or fully replace a post. Body: `{ id, day, caption, tagsSummary, slideCount, scheduledDate, scheduledTime, mediaIds, status }`. Uses `ON CONFLICT DO UPDATE` — safe to call for edits. |
| `DELETE` | `/api/posts/:id` | Permanently delete a post or draft by ID. |

---

### Folders

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/folders` | Returns all folders ordered by `created_at ASC`. |
| `POST` | `/api/folders` | Create a new folder. Body: `{ id, name, mediaIds }`. |
| `PATCH` | `/api/folders/:id` | Update `name` and/or `mediaIds` on an existing folder. Body: `{ name?, mediaIds? }`. |
| `DELETE` | `/api/folders/:id` | Delete a folder (does not delete the media items inside). |

---

### AI — Claude Proxy

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/claude` | Transparent proxy to Anthropic's `POST /v1/messages` API. The full Anthropic request body is forwarded as-is. Used by the frontend for caption generation. Requires `ANTHROPIC_API_KEY`. |
| `POST` | `/api/analyze` | Sends an image to Claude Haiku for automatic tag classification. Body: `{ dataUrl: string }`. Returns `{ tag: string }` — one of: `me`, `friends`, `outfit`, `food`, `dj`, `vibe`, `location`, `outdoor`, `night`, `other`. Requires `ANTHROPIC_API_KEY`. |

---

## 3. Implemented Features

### Media Pool
- Bulk image upload (multiple files in one go) via file input or camera
- AI auto-tagging: every uploaded image is sent to `/api/analyze` and tagged with Claude Haiku
- Lazy-loaded paginated grid (20 items per page, loads more on scroll)
- Filter by tag, filter by Used/All, sort by Latest / Oldest / Name
- Tap to open fullscreen iOS-style viewer; long-press or use Select mode for multi-select
- Fullscreen viewer: view date/time, add to carousel, open single post, favourite, change tag, delete
- Favourite system (heart toggle, in-memory per session)
- Manual tag picker — change any item's tag; opens inline over the viewer
- Folder system: create named folders, add selected items to folders, view/browse folders as album covers
- Multi-select bulk actions: add to folder, create post/carousel, delete
- Duplicate detection: uploading the same file a second time is silently ignored (matching by data URL hash)
- Video upload blocked with a 5-second banner notification
- Video disabled: all file inputs set to `accept="image/*"` only

### Today's Post Screen
- 4-option create flow (bottom sheet): Build Carousel, Single Post, AI Picks for Me, Schedule Existing
- Approved posts list: shows today's scheduled posts as cards with image preview, caption, tag summary, time
- Edit any approved post: re-opens the full carousel or single-post builder
- Delete post with confirmation prompt
- Drafts shortcut — navigate to Drafts screen from Today

### Carousel Builder
- Manual image selection: tap images in the Media Pool to build the carousel
- AI Picks for Me: generates a carousel automatically using preferred tags + AI custom instructions
- AI rule-based ordering: slide order rule (tag-sequence or AI-free) + tag sequence editor
- Slide count setting: 2–20 or Random
- Carousel image strip: reorder by drag (index badges show order), remove slides
- Add More: full pool picker to add or swap slides
- Caption generation (3 options A/B/C) using Claude via `/api/claude`
- Caption modes: Fresh, Rephrase, Shorter, Longer, Variations
- User ideas field: optional context fed into every caption prompt
- Caption editing inline with save/cancel
- Caption prompt fully customisable in Settings (editable textarea with reset button)
- Schedule date + time pickers (pre-filled from `defaultScheduleTime` setting)
- Approve & Schedule: saves to `approved_posts`, marks media as used
- Save as Draft: saves with `status: "draft"`, navigates to Drafts screen
- Edit existing post: loads carousel with existing media and caption

### Single Post Builder
- 4:5 aspect ratio image preview (matching Instagram single post format)
- Tag badge overlay on image
- Three image-change options: Choose from Pool (inline pool picker), Take Photo (camera), Camera Roll (file input)
- Pool picker modal: full media grid, tap to swap image, current image highlighted
- Caption generation: same 3-option A/B/C flow as carousel
- Caption modes: Fresh, Rephrase, Shorter, Longer, Variations, inline Edit
- Schedule date + time pickers
- Approve & Schedule + Save as Draft actions

### AI Caption Generation
- Vibe-focused default prompt: captures mood and feeling of the moment, not image descriptions
- Three captions returned as JSON array, displayed as selectable A/B/C options
- Modes: `fresh` (new set), `rephrase` (rephrase selected), `shorter`, `longer`, `variations`
- Configurable tone (presets + free text), hashtags, max length (short/medium/long)
- Custom additional instructions appended to every request
- Full caption prompt editable in Settings with a reset-to-default button

### Settings Screen
- **Caption Style**: editable caption prompt textarea + reset, tone picker + presets, preferred hashtags, max length chips, additional instructions
- **Carousel Preferences**: slide count (2–20 or Random), slide order rule (tag-sequence / AI-free) with tag sequence editor, preferred content tags, custom AI instructions
- **Manage Tags**: add custom tags with emoji — type a word, AI suggests an emoji, choose from 10 alternatives, preview shows final `"🏖️ Beach"` format before saving; hide/show base tags; view all active tags
- **Notifications**: daily reminder time picker
- **Instagram Username**: display name in header
- **Default Schedule Time**: pre-fills the schedule time picker; reset button
- Save All button: persists every setting to PostgreSQL; shows saved confirmation

### Calendar Screen
- Monthly calendar view with post indicators on days that have approved posts
- Tap a day to see posts scheduled for that date
- Navigate months forward/backward

### Drafts Screen
- Lists all posts with `status: "draft"`
- Resume editing (re-opens carousel or single post builder)
- Delete drafts
- Promote draft to approved post

---

## 4. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Required** | PostgreSQL connection string. Provided automatically by Replit's built-in PostgreSQL. |
| `ANTHROPIC_API_KEY` | **Required** | API key for Anthropic Claude. Used for AI tagging (`/api/analyze`) and caption generation (`/api/claude`). Without this, AI features return errors. |
| `SESSION_SECRET` | Required (production) | Secret used for session signing. Set as a Replit secret. |
| `PORT` | Auto-set | Port each service binds to. Assigned automatically by Replit per artifact. Do not hardcode. |
| `NODE_ENV` | Optional | `"development"` or `"production"`. Affects logging format (pretty in dev, JSON in prod). |
| `LOG_LEVEL` | Optional | Pino log level — `"info"` by default. Options: `"trace"`, `"debug"`, `"info"`, `"warn"`, `"error"`. |

---

## 5. Folder / File Structure

```
workspace/                          # pnpm monorepo root
├── package.json                    # Root — workspace scripts, devDependencies
├── pnpm-workspace.yaml             # Declares artifacts/* and lib/* as packages
├── tsconfig.base.json              # Shared TypeScript config
├── tsconfig.json                   # Project references for all libs
├── replit.md                       # Agent memory / architecture notes
├── HANDOVER.md                     # This file
│
├── artifacts/
│   │
│   ├── web-app/                    # React SPA (Vite + Tailwind)
│   │   ├── src/
│   │   │   ├── App.tsx             # ENTIRE application — all screens, state, logic (single-file SPA)
│   │   │   ├── types.ts            # TypeScript interfaces: MediaItem, ApprovedPost, AppSettings, etc.
│   │   │   ├── main.tsx            # React entry point
│   │   │   ├── index.css           # Global Tailwind styles
│   │   │   ├── components/
│   │   │   │   ├── ui/             # shadcn/ui component library (accordion, button, card, etc.)
│   │   │   │   └── layout/
│   │   │   │       └── Navbar.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── use-mobile.tsx
│   │   │   │   ├── use-toast.ts
│   │   │   │   └── use-projects.ts
│   │   │   ├── lib/
│   │   │   │   ├── utils.ts
│   │   │   │   └── schemas.ts
│   │   │   └── pages/              # Placeholder pages (not used — App.tsx renders all screens)
│   │   ├── public/
│   │   │   ├── favicon.svg
│   │   │   └── images/
│   │   ├── index.html
│   │   ├── package.json
│   │   └── vite.config.ts          # (implicit — uses Replit artifact config)
│   │
│   ├── api-server/                 # Express REST API (Node.js, TypeScript, esbuild)
│   │   ├── src/
│   │   │   ├── index.ts            # Server entry — binds to PORT
│   │   │   ├── app.ts              # Express app setup (CORS, JSON body, pino logger, router mount)
│   │   │   ├── routes/
│   │   │   │   ├── index.ts        # Combines all routers
│   │   │   │   ├── health.ts       # GET /api/healthz
│   │   │   │   ├── media.ts        # All CRUD: media, settings, posts, folders
│   │   │   │   ├── claude.ts       # POST /api/claude — Anthropic proxy
│   │   │   │   └── analyze.ts      # POST /api/analyze — AI image tagging
│   │   │   └── lib/
│   │   │       └── logger.ts       # Pino logger instance
│   │   ├── build.mjs               # esbuild bundler script
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mockup-sandbox/             # Vite dev server for UI component previews (canvas prototyping only)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── ui/             # shadcn/ui components (copy of web-app's set)
│       │   │   └── mockups/        # Canvas mockup components live here
│       │   └── main.tsx
│       ├── mockupPreviewPlugin.ts  # Vite plugin for /preview/:name routing
│       └── package.json
│
├── lib/
│   ├── db/                         # Database client shared across packages
│   │   ├── src/
│   │   │   ├── index.ts            # Exports `pool` (pg Pool) and `db` (Drizzle)
│   │   │   └── schema/
│   │   │       ├── index.ts
│   │   │       └── instaflow.ts    # Drizzle schema definitions (reference only — SQL auto-migration used)
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── api-spec/                   # OpenAPI spec (openapi.yaml) + orval codegen config
│   ├── api-client-react/           # Auto-generated typed API client (React Query hooks)
│   └── api-zod/                    # Auto-generated Zod schemas from OpenAPI spec
│
└── scripts/                        # Post-merge and utility scripts
    ├── post-merge.sh               # Runs after task agent merges (installs deps, etc.)
    └── src/hello.ts
```

---

## Architecture Notes

- **Single-file frontend**: The entire InstaFlow UI lives in `artifacts/web-app/src/App.tsx`. All screens, state, and business logic are in one file for simplicity. The shadcn/ui components in `src/components/ui/` are present but largely unused by the main app.
- **In-memory caching**: The API server caches all four collections (media, posts, settings, folders) in memory between requests. Any write operation calls the corresponding `invalidate*()` function to clear the cache. On restart the cache rebuilds from PostgreSQL on the next read.
- **AI model**: Auto-tagging uses `claude-haiku-4-5` (fast, cheap). Caption generation uses `claude-opus-4-5` or whichever model is specified in the frontend `generate3Captions` call via `/api/claude`.
- **No video support**: The server rejects video uploads at the API level. All client file inputs use `accept="image/*"`.
- **Settings storage**: All app settings are serialised to JSON and stored as key-value rows in `app_settings`. The entire settings object is loaded once at startup and saved key-by-key on the Settings save action.
- **Drafts vs Posts**: Both live in `approved_posts`. The `status` column (`"draft"` or `"approved"`) differentiates them. The client filters them into separate lists.
