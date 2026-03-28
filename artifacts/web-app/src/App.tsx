import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MediaItem, ApprovedPost, AppSettings, CaptionSettings, PoolSort, MediaFolder } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_TAG_LABELS: Record<string, string> = {
  me: "Me", outfit: "Outfit", food: "Food", dj: "DJ", vibe: "Vibe",
  friends: "Friends", location: "Location", outdoor: "Outdoor", night: "Night", other: "Other",
};
const BASE_TAG_COLORS: Record<string, string> = {
  me: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  outfit: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  food: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  dj: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  vibe: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  friends: "bg-green-500/20 text-green-300 border-green-500/30",
  location: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  outdoor: "bg-lime-500/20 text-lime-300 border-lime-500/30",
  night: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  other: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};
const BASE_TAG_ICONS: Record<string, string> = {
  me: "🧍", outfit: "👗", food: "🍽️", dj: "🎧", vibe: "✨",
  friends: "👥", location: "📍", outdoor: "🌿", night: "🌙", other: "📷",
};
const BASE_TAGS = Object.keys(BASE_TAG_LABELS);
const KEYWORD_TO_EMOJI: Record<string, string> = {
  beach: "🏖️", gym: "💪", party: "🎉", travel: "✈️", coffee: "☕",
  sunset: "🌅", night: "🌙", brunch: "🥂", summer: "☀️", winter: "❄️",
  sport: "⚽", work: "💼", studio: "🎨", music: "🎵", dance: "💃",
  nature: "🌿", city: "🏙️", home: "🏠", love: "❤️", fitness: "🏋️",
  wedding: "💍", birthday: "🎂", art: "🎨", photo: "📸", style: "👑",
  luxury: "💎", car: "🚗", dog: "🐕", cat: "🐱", event: "🎪",
  concert: "🎸", festival: "🎡", holiday: "🌴", ski: "⛷️", yoga: "🧘",
  morning: "🌄", pool: "🏊", rooftop: "🌆", bar: "🍸", club: "🪩",
  workout: "🏃", run: "🏃", hike: "🥾", snow: "❄️", rain: "🌧️",
  flower: "🌸", garden: "🌱", market: "🛒", book: "📚", film: "🎬",
  game: "🎮", trip: "🗺️", road: "🛣️", lake: "🏞️", mountain: "⛰️",
  friends: "👯", family: "👨‍👩‍👧", baby: "👶", kids: "🧒", pets: "🐾",
  fashion: "👠", shoes: "👟", bag: "👜", hat: "🧢", jewelry: "💎",
  cooking: "🍳", dinner: "🍽️", lunch: "🥗", drinks: "🍹", wine: "🍷",
  dusk: "🌇", sunrise: "🌅", sky: "☁️", stars: "⭐", moon: "🌙",
};
const ALT_EMOJIS = ["🏷️","🌟","🔥","💫","✨","🎯","💥","🌈","🎀","🦋","🌺","🎵","🌙","⚡","🍀"];
function suggestEmoji(word: string): string {
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  for (const [kw, em] of Object.entries(KEYWORD_TO_EMOJI)) {
    if (lower.includes(kw) || kw.includes(lower)) return em;
  }
  return "🏷️";
}
function parseCustomTag(tag: string): { emoji: string; word: string } {
  if (!tag) return { emoji: "🏷️", word: tag };
  const firstCodePoint = tag.codePointAt(0) ?? 0;
  const isEmoji = firstCodePoint > 127;
  if (isEmoji) {
    const spaceIdx = tag.indexOf(" ");
    if (spaceIdx !== -1) return { emoji: tag.slice(0, spaceIdx), word: tag.slice(spaceIdx + 1) };
    return { emoji: tag, word: "" };
  }
  return { emoji: "🏷️", word: tag };
}
const CUSTOM_TAG_FALLBACK_COLORS = [
  "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
];
const SUGGESTED_TONES = ["cool", "minimal", "funny", "confident", "poetic", "hype", "raw", "elegant"];
const SUGGESTED_HASHTAGS = ["lifestyle", "instagood", "photooftheday", "vibes", "music", "food", "fashion", "nightout", "friends", "travel"];
const MAX_LENGTH_LABELS = { short: "Short", medium: "Medium", long: "Long" };
const MAX_LENGTH_PROMPT = {
  short: "STRICT LENGTH: Write exactly 1 sentence. Stop after the first period. No second sentence allowed.",
  medium: "Max 2 sentences + up to 3 hashtags on a new line.",
  long: "Max 3 sentences + up to 5 hashtags on a new line.",
};
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEK_DAY_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DEFAULT_NOTIFICATION_TIME = "09:00";
const DEFAULT_SCHEDULE_TIME = "12:00";
const MAX_CAROUSEL = 20;

function tagLabel(tag: string) {
  if (BASE_TAG_LABELS[tag]) return BASE_TAG_LABELS[tag];
  return parseCustomTag(tag).word || tag;
}
function tagIcon(tag: string) {
  if (BASE_TAG_ICONS[tag]) return BASE_TAG_ICONS[tag];
  return parseCustomTag(tag).emoji;
}
function tagColor(tag: string, customTags: string[]) {
  if (BASE_TAG_COLORS[tag]) return BASE_TAG_COLORS[tag];
  const idx = customTags.indexOf(tag);
  return CUSTOM_TAG_FALLBACK_COLORS[idx % CUSTOM_TAG_FALLBACK_COLORS.length] ?? CUSTOM_TAG_FALLBACK_COLORS[0];
}

const DEFAULT_CAPTION_PROMPT = `You are writing ONE Instagram caption for a post. Do not describe individual images. Instead capture the overall mood, feeling, and vibe of the post as a whole. Write as if you are the person in the photos expressing how the moment felt. Keep it short, cool, lowercase, maximum 1-2 sentences plus maximum 2 hashtags on a new line.`;
const DEFAULT_CAPTION: CaptionSettings = {
  tone: "cool, modern, lowercase", hashtags: [], maxLength: "short",
  customInstructions: "", captionPrompt: DEFAULT_CAPTION_PROMPT,
};
const DEFAULT_SETTINGS: AppSettings = {
  notificationTime: DEFAULT_NOTIFICATION_TIME, defaultScheduleTime: DEFAULT_SCHEDULE_TIME,
  preferredTags: ["me", "vibe", "food"], captionSettings: DEFAULT_CAPTION,
  customTags: [], hiddenBaseTags: [], instagramUsername: "", aiCustomPreferences: "",
  carouselSize: "random", slideOrderRule: "me-first", tagSequence: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowTimeStr() { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function formatDay(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
function formatDayShort(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function isVideo(dataUrl: string) { return dataUrl.startsWith("data:video/"); }

async function compressImage(dataUrl: string, maxPx = 1200, quality = 0.82): Promise<string> {
  if (dataUrl.startsWith("data:video/")) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function getCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const grid: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= lastDay; d++) grid.push(d);
  return grid;
}
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function dayKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function getPostStatus(post: ApprovedPost): "scheduled" | "posted" {
  const d = post.scheduledDate ?? post.day;
  return !d || d >= todayStr() ? "scheduled" : "posted";
}
function postStatusClasses(post: ApprovedPost) {
  return getPostStatus(post) === "scheduled"
    ? { dot: "bg-blue-400", badge: "text-blue-300 bg-blue-500/20 border-blue-500/30", card: "border-blue-500/20" }
    : { dot: "bg-emerald-400", badge: "text-emerald-300 bg-emerald-500/20 border-emerald-500/30", card: "border-emerald-500/20" };
}

// ─── API helpers ──────────────────────────────────────────────────────────────
// VITE_API_URL must be set to the backend base URL in production (e.g. https://your-app.onrender.com).
// In development (Replit) it defaults to "" so relative /api/... paths are used via the Vite proxy.
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}
async function apiPost(path: string, body: object) {
  const res = await fetch(`${API_BASE}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}
async function apiPatch(path: string, body: object) {
  const res = await fetch(`${API_BASE}/api${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json();
}
async function apiPut(path: string, body: object) {
  const res = await fetch(`${API_BASE}/api${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json();
}
async function apiDelete(path: string) {
  const res = await fetch(`${API_BASE}/api${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json();
}

async function analyzeTag(dataUrl: string, availableTags: string[]): Promise<string> {
  try {
    // If the item already has a Supabase public URL, send it as `url` so the
    // backend can fetch and convert to base64 — avoids sending a stale/empty dataUrl.
    const isRemoteUrl = dataUrl.startsWith("https://") || dataUrl.startsWith("http://");
    const body = isRemoteUrl ? { url: dataUrl } : { dataUrl };
    const data = await apiPost("/analyze", body);
    const tag = data?.tag ?? "other";
    return availableTags.includes(tag) ? tag : "other";
  } catch { return "other"; }
}

// Upload image to Supabase Storage via the backend proxy.
// Returns the public URL on success, or the original base64 dataUrl as fallback.
async function uploadMediaToStorage(dataUrl: string, id: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl; // already a URL
  try {
    const result = await apiPost("/upload", { dataUrl, id });
    if ((result as any).url) return (result as any).url;
    return dataUrl; // fallback: keep base64
  } catch {
    return dataUrl; // fallback: keep base64
  }
}

async function generate3Captions(
  tags: string[], cs: CaptionSettings, isCarousel: boolean,
  mode: "fresh" | "rephrase" | "shorter" | "longer" | "variations", previousCaption?: string, theme?: string, userIdeas?: string
): Promise<string[]> {
  const basePrompt = cs.captionPrompt?.trim() || DEFAULT_CAPTION_PROMPT;
  const toneStr = cs.tone || "cool, modern";
  const isLowercase = toneStr.toLowerCase().includes("lowercase");
  const lowercaseRule = isLowercase
    ? "\nCRITICAL RULE: Write EVERY caption in all lowercase letters. No capital letters anywhere — not at the start of sentences, not for proper nouns, nowhere."
    : "";
  const customRule = cs.customInstructions?.trim()
    ? `\nAdditional instructions: ${cs.customInstructions.trim()}`
    : "";
  const hashtagHint = cs.hashtags.length > 0
    ? ` Preferred hashtags (include up to 2): ${cs.hashtags.map((h) => "#" + h).join(", ")}.`
    : "";
  const ideasRule = userIdeas?.trim()
    ? `\nUser ideas to incorporate: ${userIdeas.trim()}`
    : "";
  const contextLine = theme
    ? `Context: post themed "${theme}".`
    : isCarousel
    ? `Context: carousel post featuring images tagged ${tags.filter(Boolean).join(", ") || "general"}.`
    : `Context: single post featuring a ${tagLabel(tags[0] ?? "other")} photo.`;

  let prompt: string;
  if ((mode === "rephrase" || mode === "variations") && previousCaption) {
    prompt = `${basePrompt}

${contextLine}${hashtagHint}${lowercaseRule}${customRule}${ideasRule}

Original caption to rephrase:
"${previousCaption}"

Write 3 completely different rephrasings — same vibe, fresh words. Each one must have different energy:
- Option A: minimal and effortless
- Option B: bold and punchy
- Option C: poetic and aesthetic

Return ONLY a valid JSON array of exactly 3 strings. No explanation, no markdown:
["optionA", "optionB", "optionC"]`;
  } else if (mode === "shorter" && previousCaption) {
    prompt = `${basePrompt}

${contextLine}${hashtagHint}${lowercaseRule}${customRule}

Make this caption shorter and more concise. Give 3 options:
"${previousCaption}"

Return ONLY a valid JSON array of exactly 3 strings:
["shorter1", "shorter2", "shorter3"]`;
  } else if (mode === "longer" && previousCaption) {
    prompt = `${basePrompt}

${contextLine}${hashtagHint}${lowercaseRule}${customRule}

Expand this caption to feel richer. Give 3 options:
"${previousCaption}"

Return ONLY a valid JSON array of exactly 3 strings:
["longer1", "longer2", "longer3"]`;
  } else {
    prompt = `${basePrompt}

${contextLine} Tone: ${toneStr}.${hashtagHint}${lowercaseRule}${customRule}${ideasRule}

Write 3 completely different captions. Each must capture the vibe differently:
- Option A: minimal and effortless
- Option B: bold and punchy  
- Option C: poetic and aesthetic

Return ONLY a valid JSON array of exactly 3 strings. No explanation, no markdown, no extra text:
["optionA", "optionB", "optionC"]`;
  }

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const data = await apiPost("/claude", {
        model: "claude-3-haiku-20240307", max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      });
      const text = data.content?.[0]?.text?.trim() ?? "[]";
      const match = text.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(match?.[0] ?? "[]");
      if (Array.isArray(parsed) && parsed.length >= 3) return parsed.slice(0, 3).map(String);
      if (Array.isArray(parsed) && parsed.length > 0)
        return [...parsed, ...Array(3 - parsed.length).fill("...")].map(String).slice(0, 3);
      return ["Could not parse response.", "...", "..."];
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error("Caption generation failed. Please try again.");
}

async function generateSingleCaption(tags: string[], cs: CaptionSettings, userIdeas?: string): Promise<string> {
  const basePrompt = cs.captionPrompt?.trim() || DEFAULT_CAPTION_PROMPT;
  const toneStr = cs.tone || "cool, modern";
  const isLowercase = toneStr.toLowerCase().includes("lowercase");
  const lowercaseRule = isLowercase ? "\nCRITICAL RULE: Write in all lowercase — no capital letters anywhere." : "";
  const customRule = cs.customInstructions?.trim() ? `\nAdditional instructions: ${cs.customInstructions.trim()}` : "";
  const hashtagPart = cs.hashtags.length > 0 ? ` Preferred hashtags (max 2): ${cs.hashtags.map((h) => "#" + h).join(", ")}.` : "";
  const ideasPart = userIdeas?.trim() ? `\nUser ideas: ${userIdeas.trim()}` : "";
  const prompt = `${basePrompt}

Context: single post featuring a ${tagLabel(tags[0] ?? "other")} photo. Tone: ${toneStr}.${hashtagPart}${lowercaseRule}${customRule}${ideasPart}

Output only the caption text, nothing else.`;
  const data = await apiPost("/claude", {
    model: "claude-3-haiku-20240307", max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Empty response");
  return text;
}

async function aiPickTagsForTheme(theme: string, availableTags: string[]): Promise<string[]> {
  const data = await apiPost("/claude", {
    model: "claude-3-haiku-20240307", max_tokens: 80,
    messages: [{ role: "user", content: `Given the theme "${theme}" and these image tags: ${availableTags.join(", ")}, pick 2–4 matching tags. Return ONLY a JSON array like ["tag1","tag2"]. No explanation.` }],
  });
  const text = data.content?.[0]?.text?.trim() ?? "[]";
  try {
    const parsed = JSON.parse(text.match(/\[.*\]/s)?.[0] ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t: string) => availableTags.includes(t)) : [];
  } catch { return []; }
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return mon.toISOString().split("T")[0];
}

function buildCarouselOrder(items: MediaItem[], ids: string[], rule: AppSettings["slideOrderRule"] = "me-first", tagSeq: string[] = []): string[] {
  const selected = ids.map((id) => items.find((m) => m.id === id)).filter(Boolean) as MediaItem[];
  if (rule === "ai-free") return ids;
  if (rule === "tag-sequence" && tagSeq.length > 0) {
    const buckets: Record<string, MediaItem[]> = {};
    const untagged: MediaItem[] = [];
    selected.forEach((m) => {
      const t = m.tag ?? "";
      if (tagSeq.includes(t)) { if (!buckets[t]) buckets[t] = []; buckets[t].push(m); }
      else untagged.push(m);
    });
    const ordered: MediaItem[] = [];
    tagSeq.forEach((t) => { if (buckets[t]) ordered.push(...buckets[t]); });
    ordered.push(...untagged);
    return ordered.map((m) => m.id);
  }
  const first = selected.find((m) => m.tag === "me") ?? selected.find((m) => m.tag === "friends") ?? selected[0];
  if (!first) return ids;
  return [first.id, ...selected.filter((m) => m.id !== first.id).map((m) => m.id)];
}
function reorder<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
}

// ─── App ─────────────────────────────────────────────────────────────────────
type Screen = "pool" | "carousel" | "calendar" | "settings" | "single";
const LAST_TAB_KEY = "instaflow_last_tab";

export default function App() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaHasMore, setMediaHasMore] = useState(false);
  const [mediaLoadingMore, setMediaLoadingMore] = useState(false);
  const [videoDisabledBanner, setVideoDisabledBanner] = useState(false);
  const [approvedPosts, setApprovedPosts] = useState<ApprovedPost[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [screen, setScreen] = useState<Screen>(() => {
    const saved = localStorage.getItem(LAST_TAB_KEY) as Screen | null;
    return (saved && ["pool","carousel","calendar","settings"].includes(saved)) ? saved : "pool";
  });

  // Pool controls
  const [poolSort, setPoolSort] = useState<PoolSort>("latest");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [usedFilter, setUsedFilter] = useState<"active" | "used">("active");
  const [usedSubFilter, setUsedSubFilter] = useState<"all" | "scheduled" | "posted">("all");
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // Carousel / caption
  const [carouselIds, setCarouselIds] = useState<string[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselCaption, setCarouselCaption] = useState("");
  const [captionOptions, setCaptionOptions] = useState<string[] | null>(null);
  const [captionSelectedIdx, setCaptionSelectedIdx] = useState<number | null>(null);
  const [captionOptionsExpanded, setCaptionOptionsExpanded] = useState(false);
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [editingCaption, setEditingCaption] = useState("");
  const [scheduleDate, setScheduleDate] = useState(todayStr());
  const [scheduleTime, setScheduleTime] = useState(nowTimeStr());
  const [editingPost, setEditingPost] = useState<ApprovedPost | null>(null);

  // Filmstrip drag
  const [filmDragFrom, setFilmDragFrom] = useState<number | null>(null);
  const [filmDragOver, setFilmDragOver] = useState<number | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const touchScrollRef = useRef<{ startX: number; startScrollLeft: number; active: boolean }>({ startX: 0, startScrollLeft: 0, active: false });
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const pointerDragRef = useRef<{
    pointerId: number; fromIndex: number; overIndex: number;
    startX: number; startY: number; active: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  // Pool
  const [selectionMode, setSelectionMode] = useState<"carousel" | "single" | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [addMoreOpen, setAddMoreOpen] = useState(false);

  // Single post
  const [singlePostItem, setSinglePostItem] = useState<MediaItem | null>(null);
  const [singleCaption, setSingleCaption] = useState("");
  const [singleGenerating, setSingleGenerating] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleEditing, setSingleEditing] = useState(false);
  const [singleEditText, setSingleEditText] = useState("");
  const [singleScheduleDate, setSingleScheduleDate] = useState(todayStr());
  const [singleScheduleTime, setSingleScheduleTime] = useState(DEFAULT_SCHEDULE_TIME);

  // Tags
  const [tagPickerItem, setTagPickerItem] = useState<MediaItem | null>(null);
  const [videoTagQueue, setVideoTagQueue] = useState<MediaItem[]>([]);

  // AI
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTypeModal, setAiTypeModal] = useState(false);
  const [aiRuleBasedEnabled, setAiRuleBasedEnabled] = useState(true); // Fix 6

  // Settings
  const [newTagInput, setNewTagInput] = useState("");
  const [tagInputEmoji, setTagInputEmoji] = useState("🏷️");
  const [singlePickerOpen, setSinglePickerOpen] = useState(false);
  const [newHashtagInput, setNewHashtagInput] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Calendar
  const [calendarView, setCalendarView] = useState<"month" | "list" | "week">("list");
  const [calendarMonth, setCalendarMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => getWeekStart(todayStr()));
  const [calendarDaySelected, setCalendarDaySelected] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<ApprovedPost | null>(null);
  const [previewSlide, setPreviewSlide] = useState(0);
  const [deleteConfirmPost, setDeleteConfirmPost] = useState<ApprovedPost | null>(null);
  const previewSwipeX = useRef<number | null>(null);

  // Folders
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [openFolder, setOpenFolder] = useState<MediaFolder | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(false);
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<MediaItem | null>(null);
  const [folderAddMode, setFolderAddMode] = useState(false);
  const [folderAddSourceSheet, setFolderAddSourceSheet] = useState(false);
  const [folderItemContextMenu, setFolderItemContextMenu] = useState<MediaItem | null>(null);
  const [longPressFolder, setLongPressFolder] = useState<MediaFolder | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<MediaFolder | null>(null);
  const [folderNameError, setFolderNameError] = useState(false);
  // Fix 1: Today screen mode — true when actively building a new post from Today screen
  const [todayBuildMode, setTodayBuildMode] = useState(false);
  // Fix 3: Video poster frames (mediaId → data URL) and which video is playing
  const [videoPosters, setVideoPosters] = useState<Record<string, string>>({});
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  // Bulk selection (pool)
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);

  // Caption user ideas
  const [captionUserIdeas, setCaptionUserIdeas] = useState("");

  // Video upload progress
  const [videoUploadProgress, setVideoUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // AI carousel source
  const [aiCarouselSource, setAiCarouselSource] = useState<"all" | "tag" | "folder">("all");
  const [aiCarouselTags, setAiCarouselTags] = useState<string[]>([]);
  const [aiCarouselFolderId, setAiCarouselFolderId] = useState("");

  // Notifications
  const [dailyBadge, setDailyBadge] = useState(false);
  const [dailyBanner, setDailyBanner] = useState(false);

  // Discard confirm
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);

  // Fullscreen viewer
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null);
  const [viewerFavorites, setViewerFavorites] = useState<Set<string>>(new Set());
  const viewerVideoRef = useRef<HTMLVideoElement>(null);

  // Edit-from tracking (Fix 8)
  const [editingFrom, setEditingFrom] = useState<"calendar" | "used">("calendar");

  // AI cancel
  const generationIdRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreCameraRef = useRef<HTMLInputElement>(null);
  const addMoreLibraryRef = useRef<HTMLInputElement>(null);
  const singleLibraryRef = useRef<HTMLInputElement>(null);
  const singleCameraRef = useRef<HTMLInputElement>(null);
  const folderCameraInputRef = useRef<HTMLInputElement>(null);
  const swipeStartX = useRef<number | null>(null);

  // Tag picker — when opened from fullscreen viewer, restore viewer on close
  const [tagPickerReturnItem, setTagPickerReturnItem] = useState<MediaItem | null>(null);

  // Duplicate upload banner
  const [duplicatesBanner, setDuplicatesBanner] = useState<string[]>([]);

  // Folder — pending selection before confirm-add
  const [folderPendingIds, setFolderPendingIds] = useState<string[]>([]);

  // Single post — 3-option captions + ideas (mirrors carousel)
  const [singleCaptionOptions, setSingleCaptionOptions] = useState<string[] | null>(null);
  const [singleCaptionIdx, setSingleCaptionIdx] = useState<number | null>(null);
  const [singleUserIdeas, setSingleUserIdeas] = useState("");
  const [singleCaptionOptionsExpanded, setSingleCaptionOptionsExpanded] = useState(false);
  const singlePostFromScreen = useRef<Screen>("pool");
  const [singleToast, setSingleToast] = useState<string | null>(null);
  const [singleChooseFileOpen, setSingleChooseFileOpen] = useState(false);
  const [singleAiMode, setSingleAiMode] = useState(false);

  useEffect(() => { localStorage.setItem(LAST_TAB_KEY, screen); }, [screen]);

  // Load + reconcile on mount
  useEffect(() => {
    async function loadAll() {
      try {
        const [mediaResp, posts, settings, rawFolders] = await Promise.all([
          apiGet<{ items: any[]; hasMore: boolean; total: number; page: number }>("/media?page=1"),
          apiGet<any[]>("/posts"),
          apiGet<Record<string, string>>("/settings"),
          apiGet<any[]>("/folders").catch(() => []),
        ]);
        const items: MediaItem[] = (mediaResp.items ?? []).map((i: any) => ({ ...i, analyzing: false }));
        setMediaHasMore(mediaResp.hasMore ?? false);
        setMediaPage(1);
        const mediaIdsInPosts = new Set(posts.flatMap((p: any) => p.mediaIds ?? []));
        const toUnmark = items.filter((m) => m.used && !mediaIdsInPosts.has(m.id));
        if (toUnmark.length > 0) {
          await Promise.all(toUnmark.map((m) => apiPatch(`/media/${m.id}`, { used: false }).catch(() => {})));
          toUnmark.forEach((m) => { m.used = false; });
        }
        setMediaItems(items);
        setApprovedPosts(posts);
        const captionSettingsRaw = settings.captionSettings ? JSON.parse(settings.captionSettings) : DEFAULT_CAPTION;
        if (!captionSettingsRaw.captionPrompt) captionSettingsRaw.captionPrompt = DEFAULT_CAPTION_PROMPT;
        const loaded: AppSettings = {
          notificationTime: settings.notificationTime ?? DEFAULT_NOTIFICATION_TIME,
          defaultScheduleTime: settings.defaultScheduleTime ?? DEFAULT_SCHEDULE_TIME,
          preferredTags: settings.preferredTags ? JSON.parse(settings.preferredTags) : DEFAULT_SETTINGS.preferredTags,
          captionSettings: captionSettingsRaw,
          customTags: settings.customTags ? JSON.parse(settings.customTags) : [],
          hiddenBaseTags: settings.hiddenBaseTags ? JSON.parse(settings.hiddenBaseTags) : [],
          instagramUsername: settings.instagramUsername ?? "",
          aiCustomPreferences: settings.aiCustomPreferences ?? "",
          carouselSize: settings.carouselSize ? JSON.parse(settings.carouselSize) : "random",
          slideOrderRule: settings.slideOrderRule ? JSON.parse(settings.slideOrderRule) : "me-first",
          tagSequence: settings.tagSequence ? JSON.parse(settings.tagSequence) : [],
        };
        setAppSettings(loaded);
        setScheduleTime(loaded.defaultScheduleTime);
        setSingleScheduleTime(loaded.defaultScheduleTime);
        setFolders(rawFolders.map((f: any) => ({ id: f.id, name: f.name, mediaIds: f.mediaIds ?? [], createdAt: f.createdAt })));
      } catch (err) { console.error("Failed to load", err); }
      finally { setMediaLoading(false); }
    }
    loadAll();
  }, []);

  async function loadMoreMedia() {
    if (mediaLoadingMore || !mediaHasMore) return;
    setMediaLoadingMore(true);
    try {
      const nextPage = mediaPage + 1;
      const resp = await apiGet<{ items: any[]; hasMore: boolean; total: number; page: number }>(`/media?page=${nextPage}`);
      const newItems: MediaItem[] = (resp.items ?? []).map((i: any) => ({ ...i, analyzing: false }));
      setMediaItems((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        return [...prev, ...newItems.filter((m) => !existingIds.has(m.id))];
      });
      setMediaHasMore(resp.hasMore ?? false);
      setMediaPage(nextPage);
    } catch (err) { console.error("Failed to load more", err); }
    finally { setMediaLoadingMore(false); }
  }

  useEffect(() => {
    function check() {
      const now = new Date();
      const cur = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = todayStr();
      if (cur >= appSettings.notificationTime && localStorage.getItem("lastCarouselSuggestion") !== today) {
        localStorage.setItem("lastCarouselSuggestion", today);
        setDailyBadge(true); setDailyBanner(true);
      }
    }
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [appSettings.notificationTime]);

  // Video poster generation disabled — videos are not supported (base64 video causes memory crashes)
  const _videoIdsKey = "";

  // ── Derived ──
  const allAvailableTags = useMemo(() => [
    ...BASE_TAGS.filter((t) => !appSettings.hiddenBaseTags.includes(t)),
    ...appSettings.customTags,
  ], [appSettings.hiddenBaseTags, appSettings.customTags]);

  const mediaMap = useMemo(() => Object.fromEntries(mediaItems.map((m) => [m.id, m])), [mediaItems]);
  const folderItemIds = useMemo(() => new Set(folders.flatMap((f) => f.mediaIds)), [folders]);
  const carouselItems = useMemo(() => carouselIds.map((id) => mediaMap[id]).filter(Boolean) as MediaItem[], [carouselIds, mediaMap]);
  const filmDisplayIds = useMemo(() => {
    if (filmDragFrom === null || filmDragOver === null || filmDragFrom === filmDragOver) return carouselIds;
    return reorder(carouselIds, filmDragFrom, filmDragOver);
  }, [carouselIds, filmDragFrom, filmDragOver]);
  const currentSlide = carouselItems[carouselIndex];

  const filteredSortedMedia = useMemo(() => {
    let items = [...mediaItems];
    if (usedFilter === "used") items = items.filter((m) => m.used);
    else items = items.filter((m) => !m.used && !folderItemIds.has(m.id));
    if (activeFilters.length > 0) items = items.filter((m) => m.tag && activeFilters.includes(m.tag));
    if (poolSort === "oldest") items.sort((a, b) => (a.createdAt ?? "") < (b.createdAt ?? "") ? -1 : 1);
    else if (poolSort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
    else items.sort((a, b) => (a.createdAt ?? "") > (b.createdAt ?? "") ? -1 : 1);
    return items;
  }, [mediaItems, activeFilters, poolSort, usedFilter, folderItemIds]);

  const tagsInActivePool = allAvailableTags;

  // Used tab groups
  const usedGroupedByPost = useMemo(() => {
    if (usedFilter !== "used") return [];
    const groups: Array<{ post: ApprovedPost | null; items: MediaItem[]; weekLabel: string }> = [];
    const assigned = new Set<string>();
    const filteredPosts = [...approvedPosts].filter((p) => {
      if (usedSubFilter === "scheduled") return getPostStatus(p) === "scheduled";
      if (usedSubFilter === "posted") return getPostStatus(p) === "posted";
      return true;
    }).sort((a, b) => (a.scheduledDate ?? a.day) > (b.scheduledDate ?? b.day) ? -1 : 1);
    for (const post of filteredPosts) {
      if (!post.mediaIds?.length) continue;
      const items = post.mediaIds.map((id) => mediaMap[id]).filter(Boolean) as MediaItem[];
      if (items.length > 0) {
        const d = post.scheduledDate ?? post.day;
        let weekLabel = "";
        if (d) {
          const date = new Date(d + "T12:00:00");
          weekLabel = `${MONTH_NAMES[date.getMonth()]} · CW ${getISOWeek(date)}`;
        }
        groups.push({ post, items, weekLabel });
        items.forEach((m) => assigned.add(m.id));
      }
    }
    if (usedSubFilter === "all") {
      const unassigned = mediaItems.filter((m) => m.used && !assigned.has(m.id));
      if (unassigned.length > 0) groups.push({ post: null, items: unassigned, weekLabel: "" });
    }
    return groups;
  }, [usedFilter, usedSubFilter, approvedPosts, mediaItems, mediaMap]);

  // Calendar
  const draftPosts = useMemo(() =>
    approvedPosts.filter((p) => p.status === "draft")
      .sort((a, b) => a.createdAt > b.createdAt ? -1 : 1),
    [approvedPosts]);
  const scheduledPosts = useMemo(() =>
    approvedPosts.filter((p) => p.status !== "draft"),
    [approvedPosts]);
  const sortedPosts = useMemo(() =>
    [...scheduledPosts].sort((a, b) => (a.scheduledDate ?? a.day) < (b.scheduledDate ?? b.day) ? -1 : 1),
    [scheduledPosts]);
  const postsByDate = useMemo(() => {
    const map: Record<string, ApprovedPost[]> = {};
    for (const p of scheduledPosts) {
      const d = p.scheduledDate ?? p.day; if (!d) continue;
      map[d] = [...(map[d] ?? []), p];
    }
    return map;
  }, [scheduledPosts]);
  const calendarListGroups = useMemo(() => {
    type WG = { week: number; posts: ApprovedPost[] };
    type MG = { label: string; ym: string; weeks: WG[] };
    const months: MG[] = [];
    const mmap: Record<string, MG> = {};
    for (const p of sortedPosts) {
      const d = p.scheduledDate ?? p.day; if (!d) continue;
      const date = new Date(d + "T12:00:00");
      const ym = d.slice(0, 7);
      const week = getISOWeek(date);
      if (!mmap[ym]) {
        const mg: MG = { label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }), ym, weeks: [] };
        mmap[ym] = mg; months.push(mg);
      }
      const mg = mmap[ym];
      let wg = mg.weeks.find((w) => w.week === week);
      if (!wg) { wg = { week, posts: [] }; mg.weeks.push(wg); }
      wg.posts.push(p);
    }
    return months;
  }, [sortedPosts]);

  const previewItems = useMemo(() => {
    if (!previewPost) return [];
    return (previewPost.mediaIds ?? []).map((id) => mediaMap[id]).filter(Boolean) as MediaItem[];
  }, [previewPost, mediaMap]);

  const igUsername = appSettings.instagramUsername || "instaflow_user";

  // ── Swipe carousel ──
  function onSwipeStart(e: React.TouchEvent) { swipeStartX.current = e.touches[0].clientX; }
  function onSwipeEnd(e: React.TouchEvent) {
    if (swipeStartX.current === null) return;
    const d = e.changedTouches[0].clientX - swipeStartX.current; swipeStartX.current = null;
    if (Math.abs(d) < 50) return;
    if (d < 0 && carouselIndex < carouselItems.length - 1) setCarouselIndex((i) => i + 1);
    else if (d > 0 && carouselIndex > 0) setCarouselIndex((i) => i - 1);
  }

  // ── Upload ──
  async function handleFilesAdded(files: File[], addToCarousel = false, targetFolderId?: string) {
    const imageFiles = files.filter((f) => !f.type.startsWith("video/"));
    const videoFiles = files.filter((f) => f.type.startsWith("video/"));

    // Block video uploads — not supported until object storage is set up
    if (videoFiles.length > 0) {
      setVideoDisabledBanner(true);
      setTimeout(() => setVideoDisabledBanner(false), 5000);
      if (imageFiles.length === 0) return;
    }

    // Duplicate detection — skip files whose name already exists in the pool
    const existingNames = new Set(mediaItems.map((m) => m.name));
    const duplicateFiles = imageFiles.filter((f) => existingNames.has(f.name));
    const newImageFiles = imageFiles.filter((f) => !existingNames.has(f.name));
    if (duplicateFiles.length > 0) {
      const names = duplicateFiles.map((f) => f.name);
      setDuplicatesBanner(names);
      setTimeout(() => setDuplicatesBanner([]), 5000);
      if (newImageFiles.length === 0) return;
    }

    // Process images in parallel (fast)
    const imageItems = await Promise.all(newImageFiles.map((f) => new Promise<MediaItem>((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const raw = e.target?.result as string;
        const dataUrl = await compressImage(raw);
        resolve({ id: generateId(), name: f.name, tag: null, analyzing: true, dataUrl, used: false });
      };
      reader.readAsDataURL(f);
    })));

    // Process videos sequentially one-by-one (heavy, avoid memory crash)
    const videoItems: MediaItem[] = [];
    if (videoFiles.length > 0) {
      setVideoUploadProgress({ current: 0, total: videoFiles.length });
      for (let i = 0; i < videoFiles.length; i++) {
        setVideoUploadProgress({ current: i + 1, total: videoFiles.length });
        const f = videoFiles[i];
        const item = await new Promise<MediaItem>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            resolve({ id: generateId(), name: f.name, tag: null, analyzing: false, dataUrl, used: false });
          };
          reader.readAsDataURL(f);
        });
        videoItems.push(item);
        // Add video to state immediately so user sees progress
        setMediaItems((prev) => [...prev, item]);
      }
      setVideoUploadProgress(null);
    }

    const withData = [...imageItems, ...videoItems];

    if (imageItems.length > 0) {
      if (addToCarousel) {
        const toAdd = imageItems.slice(0, MAX_CAROUSEL - carouselIds.length);
        setMediaItems((prev) => [...prev, ...imageItems]);
        setCarouselIds((prev) => [...prev, ...toAdd.map((m) => m.id)]);
        setCaptionOptions(null); setCaptionSelectedIdx(null); setCarouselCaption("");
        setAddMoreOpen(false);
      } else {
        setMediaItems((prev) => [...prev, ...imageItems]);
      }
    }

    // Add all uploaded items to target folder if specified
    if (targetFolderId && withData.length > 0) {
      const ids = withData.map((m) => m.id);
      setFolders((prev) => prev.map((f) => f.id === targetFolderId
        ? { ...f, mediaIds: [...f.mediaIds, ...ids.filter((id) => !f.mediaIds.includes(id))] }
        : f));
      const folder = folders.find((f) => f.id === targetFolderId);
      if (folder) {
        const newIds = [...new Set([...folder.mediaIds, ...ids])];
        try { await apiPatch(`/folders/${targetFolderId}`, { mediaIds: newIds }); } catch {}
      }
    }

    if (videoItems.length > 0) setVideoTagQueue((prev) => [...prev, ...videoItems]);

    // Auto-tag images (using base64 still in state), then upload+persist via /media/upload
    for (const item of imageItems) {
      // analyzeTag while item.dataUrl is still base64 (before Supabase upload)
      const tag = await analyzeTag(item.dataUrl, allAvailableTags);
      setMediaItems((prev) => prev.map((m) => m.id === item.id ? { ...m, tag, analyzing: false } : m));
      try {
        // Single endpoint: uploads to Supabase Storage AND saves DB record
        const saved = await apiPost("/media/upload", { id: item.id, name: item.name, dataUrl: item.dataUrl, tag });
        const storedUrl: string = (saved as any).dataUrl ?? item.dataUrl;
        // Swap local base64 for the persisted Supabase URL in state
        if (storedUrl !== item.dataUrl) {
          setMediaItems((prev) => prev.map((m) => m.id === item.id ? { ...m, dataUrl: storedUrl } : m));
        }
      } catch (err) { console.error("Failed to save media", err); }
    }
  }

  async function handleDeleteMedia(id: string) {
    setMediaItems((prev) => prev.filter((m) => m.id !== id));
    setCarouselIds((prev) => prev.filter((cid) => cid !== id));
    setViewerItem(null);
    try { await apiDelete(`/media/${id}`); } catch {}
  }

  async function markItemsUsed(ids: string[]) {
    if (!ids.length) return;
    setMediaItems((prev) => prev.map((m) => ids.includes(m.id) ? { ...m, used: true } : m));
    await Promise.all(ids.map((id) => apiPatch(`/media/${id}`, { used: true }).catch(() => {})));
  }

  async function reconcileAfterDelete(remainingPosts: ApprovedPost[], currentItems: MediaItem[]) {
    const inPosts = new Set(remainingPosts.flatMap((p) => p.mediaIds ?? []));
    const toUnmark = currentItems.filter((m) => m.used && !inPosts.has(m.id));
    if (!toUnmark.length) return;
    const ids = toUnmark.map((m) => m.id);
    setMediaItems((prev) => prev.map((m) => ids.includes(m.id) ? { ...m, used: false } : m));
    await Promise.all(ids.map((id) => apiPatch(`/media/${id}`, { used: false }).catch(() => {})));
  }

  // ── Folders ──
  async function handleCreateFolder(name: string, initialIds?: string[]) {
    const trimmed = name.trim();
    if (!trimmed) { setFolderNameError(true); return; }
    const folder: MediaFolder = { id: generateId(), name: trimmed, mediaIds: initialIds ?? [], createdAt: new Date().toISOString() };
    // Close form immediately so UX feels snappy
    setCreateFolderOpen(false);
    setNewFolderName("");
    setFolderNameError(false);
    // Persist to DB first — only add to state on success so it never "disappears"
    try {
      await apiPost("/folders", { id: folder.id, name: folder.name, mediaIds: folder.mediaIds });
      setFolders((prev) => [...prev, folder]);
    } catch (err) {
      console.error("Failed to save folder to DB:", err);
      // Re-open the form so the user can retry
      setNewFolderName(trimmed);
      setCreateFolderOpen(true);
    }
  }

  function submitCreateFolder() {
    const name = newFolderName.trim();
    if (!name) { setFolderNameError(true); return; }
    handleCreateFolder(name, bulkSelectedIds);
  }
  async function handleMoveToFolder(folderId: string, ids: string[]) {
    await handleAddToFolder(folderId, ids);
  }
  async function handleUpdateFolderItems(folderId: string, newIds: string[]) {
    setFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, mediaIds: newIds } : f));
    setOpenFolder((prev) => prev?.id === folderId ? { ...prev, mediaIds: newIds } : prev);
    try { await apiPatch(`/folders/${folderId}`, { mediaIds: newIds }); } catch {}
  }
  async function handleAddToFolder(folderId: string, idsToAdd: string[]) {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    await handleUpdateFolderItems(folderId, [...new Set([...folder.mediaIds, ...idsToAdd])]);
  }
  async function handleRemoveFromFolder(folderId: string, idToRemove: string) {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    await handleUpdateFolderItems(folderId, folder.mediaIds.filter((id) => id !== idToRemove));
  }
  async function handleDeleteFolder(folderId: string) {
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    if (openFolder?.id === folderId) setOpenFolder(null);
    try { await apiDelete(`/folders/${folderId}`); } catch {}
  }

  // ── Bulk selection ──
  function clearLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    longPressStartPos.current = null;
  }
  function startPoolLongPress(item: MediaItem, e: React.PointerEvent, inFolder: boolean) {
    if (selectionMode || bulkMode) return;
    longPressFired.current = false;
    longPressStartPos.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      try { (navigator as any).vibrate?.(25); } catch {}
      if (inFolder) {
        setFolderItemContextMenu(item);
      } else {
        setBulkMode(true);
        setBulkSelectedIds([item.id]);
      }
    }, 500);
  }
  function checkLongPressMove(e: React.PointerEvent) {
    if (!longPressStartPos.current) return;
    if (Math.abs(e.clientX - longPressStartPos.current.x) > 10 || Math.abs(e.clientY - longPressStartPos.current.y) > 10) clearLongPress();
  }
  function cancelBulkMode() { setBulkMode(false); setBulkSelectedIds([]); longPressFired.current = false; }
  async function handleBulkDelete() {
    const ids = new Set(bulkSelectedIds);
    cancelBulkMode();
    setMediaItems((prev) => prev.filter((m) => !ids.has(m.id)));
    setCarouselIds((prev) => prev.filter((id) => !ids.has(id)));
    const updatedFolders = folders.map((f) => {
      const newIds = f.mediaIds.filter((id) => !ids.has(id));
      return { ...f, mediaIds: newIds };
    });
    setFolders(updatedFolders);
    await Promise.all([
      ...[...ids].map((id) => apiDelete(`/media/${id}`).catch(() => {})),
      ...updatedFolders
        .filter((f, i) => f.mediaIds.length !== folders[i]?.mediaIds.length)
        .map((f) => apiPatch(`/folders/${f.id}`, { mediaIds: f.mediaIds }).catch(() => {})),
    ]);
  }
  function handleBulkCreatePost() {
    const validIds = bulkSelectedIds.filter((id) => !!mediaMap[id]);
    cancelBulkMode();
    if (validIds.length === 1) {
      // Single post — open directly
      const item = mediaMap[validIds[0]];
      if (item) openSinglePost(item);
    } else {
      // Carousel — transfer to selection mode with pre-filled ids
      setSelectionMode("carousel");
      setSelectedIds(validIds);
    }
  }
  async function handleBulkMoveToFolder(folderId: string) {
    await handleAddToFolder(folderId, bulkSelectedIds);
    cancelBulkMode();
    setFolderPickerOpen(false);
  }

  // ── AI source pool ──
  function getAISourcePool(): MediaItem[] {
    let base = mediaItems.filter((m) => !m.analyzing);
    if (aiCarouselSource === "tag" && aiCarouselTags.length > 0) {
      base = base.filter((m) => m.tag && aiCarouselTags.includes(m.tag));
    } else if (aiCarouselSource === "folder" && aiCarouselFolderId) {
      const folder = folders.find((f) => f.id === aiCarouselFolderId);
      if (folder) base = base.filter((m) => folder.mediaIds.includes(m.id)).slice(0, 20);
      else base = [];
    } else {
      base = base.filter((m) => !m.used);
    }
    return base;
  }

  // ── Tags ──
  function closeTagPicker() {
    // If tag picker was opened from the fullscreen viewer, restore it
    if (tagPickerReturnItem) {
      setViewerItem(tagPickerReturnItem);
      setTagPickerReturnItem(null);
    }
    setTagPickerItem(null);
  }
  async function handleTagChange(itemId: string, newTag: string) {
    setMediaItems((prev) => prev.map((m) => m.id === itemId ? { ...m, tag: newTag } : m));
    closeTagPicker();
    try { await apiPatch(`/media/${itemId}`, { tag: newTag }); } catch {}
  }
  async function handleVideoTagSelect(tag: string) {
    const item = videoTagQueue[0]; if (!item) return;
    setVideoTagQueue((prev) => prev.slice(1));
    setMediaItems((prev) => prev.map((m) => m.id === item.id ? { ...m, tag, analyzing: false } : m));
    try {
      // Videos: use legacy /media endpoint (Supabase Storage doesn't accept video in this app)
      await apiPost("/media", { id: item.id, name: item.name, tag, dataUrl: item.dataUrl, used: false });
    } catch (err) { console.error(err); }
  }

  // ── Selection ──
  function enterSelectionMode(mode: "carousel" | "single", preSelectId?: string) {
    setSelectionMode(mode); setSelectedIds(preSelectId ? [preSelectId] : []);
    setViewerItem(null); setPlusMenuOpen(false);
  }
  function toggleSelect(id: string) {
    if (selectionMode === "single") { setSelectedIds([id]); return; }
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (next.length === 0) { setSelectionMode(null); } // Fix 2: auto-hide menu when empty
        return next;
      }
      return prev.length >= MAX_CAROUSEL ? prev : [...prev, id];
    });
  }
  function cancelSelection() { setSelectionMode(null); setSelectedIds([]); }

  function hasCarouselChanges() {
    if (editingPost) {
      const origIds = editingPost.mediaIds ?? [];
      const sameIds = carouselIds.length === origIds.length && carouselIds.every((id, i) => origIds[i] === id);
      return !sameIds || carouselCaption !== editingPost.caption || scheduleDate !== (editingPost.scheduledDate ?? todayStr());
    }
    return carouselIds.length > 0;
  }

  function attemptCancel(action: () => void) {
    if (hasCarouselChanges()) { setDiscardAction(() => action); setDiscardConfirm(true); }
    else action();
  }

  function cancelAIGeneration() {
    generationIdRef.current += 1;
    setGeneratingCaptions(false);
    setAiGenerating(false);
  }

  function handleBuildCarouselFromSelection() {
    const ordered = buildCarouselOrder(mediaItems, selectedIds, appSettings.slideOrderRule, appSettings.tagSequence);
    setCarouselIds(ordered); setCarouselIndex(0);
    setCarouselCaption(""); setCaptionOptions(null); setCaptionSelectedIdx(null); setCaptionOptionsExpanded(false);
    setCaptionError(null); setIsEditingCaption(false); setEditingPost(null);
    setScheduleDate(todayStr()); setScheduleTime(nowTimeStr());
    cancelSelection(); setScreen("carousel"); setDailyBadge(false); setDailyBanner(false); setTodayBuildMode(true);
  }

  function openPostForEdit(post: ApprovedPost, from: "calendar" | "used" = "calendar") {
    setEditingPost(post);
    setEditingFrom(from);
    setCarouselIds(post.mediaIds ?? []);
    setCarouselIndex(0);
    setCarouselCaption(post.caption);
    setEditingCaption(post.caption);
    setCaptionOptions(null); setCaptionSelectedIdx(null); setCaptionOptionsExpanded(false);
    setIsEditingCaption(false); setCaptionError(null);
    setScheduleDate(post.scheduledDate ?? todayStr());
    setScheduleTime(post.scheduledTime ?? nowTimeStr());
    setCalendarDaySelected(null);
    setScreen("carousel"); setTodayBuildMode(true);
  }

  // ── Single post ──
  function openSinglePost(item: MediaItem) {
    singlePostFromScreen.current = (screen === "single" ? singlePostFromScreen.current : screen) as Screen;
    setSinglePostItem(item); setSingleCaption(""); setSingleError(null);
    setSingleEditing(false); setSingleScheduleDate(todayStr()); setSingleScheduleTime(nowTimeStr());
    setSingleCaptionOptions(null); setSingleCaptionIdx(null); setSingleCaptionOptionsExpanded(false);
    setViewerItem(null); cancelSelection();
    setScreen("single");
  }
  function cancelSinglePost() {
    setSinglePostItem(null);
    setScreen(singlePostFromScreen.current);
  }
  function showSingleToast(msg: string) {
    setSingleToast(msg);
    setTimeout(() => setSingleToast(null), 2000);
  }
  function handleSingleNewMedia() {
    const unused = mediaItems.filter((m) => !m.used && !m.analyzing);
    if (!unused.length) return;
    const currentIdx = singlePostItem ? unused.findIndex((m) => m.id === singlePostItem.id) : -1;
    const nextItem = unused[(currentIdx + 1) % unused.length];
    setSinglePostItem(nextItem);
    setSingleCaption(""); setSingleError(null);
    setSingleEditing(false); setSingleCaptionOptions(null); setSingleCaptionIdx(null); setSingleCaptionOptionsExpanded(false);
  }
  function handleStartSinglePost() { const item = mediaMap[selectedIds[0]]; if (item) openSinglePost(item); }
  async function handleGenerateSingleCaption(mode: "fresh" | "rephrase" | "shorter" | "longer" | "variations" = "fresh") {
    if (!singlePostItem) return;
    setSingleGenerating(true); setSingleError(null); setSingleCaptionOptions(null); setSingleCaptionIdx(null);
    try {
      const prevCaption = singleCaption || undefined;
      const opts = await generate3Captions([singlePostItem.tag ?? "other"], appSettings.captionSettings, true, mode, prevCaption, undefined, singleUserIdeas);
      setSingleCaptionOptions(opts);
      setSingleCaptionIdx(0);
      setSingleCaption(opts[0]);
    }
    catch (err) { setSingleError(err instanceof Error ? err.message : "Failed"); }
    finally { setSingleGenerating(false); }
  }
  async function handleApproveSinglePost() {
    if (!singlePostItem) return;
    const finalCaption = singleEditing ? singleEditText : singleCaption;
    const effectiveDate = singleScheduleDate || todayStr();
    const post: ApprovedPost = {
      id: generateId(), day: effectiveDate, caption: finalCaption,
      tagsSummary: tagIcon(singlePostItem.tag ?? "other"), slideCount: 1,
      scheduledDate: effectiveDate, scheduledTime: singleScheduleTime || appSettings.defaultScheduleTime,
      mediaIds: [singlePostItem.id], createdAt: new Date().toISOString(),
    };
    setApprovedPosts((prev) => [post, ...prev]);
    await markItemsUsed([singlePostItem.id]);
    setSinglePostItem(null);
    try { await apiPost("/posts", post); } catch {}
    goToScreen("calendar");
  }

  // ── Caption – 3-option system ──
  async function handleGetCaptionOptions(mode: "fresh" | "variations") {
    if (!carouselItems.length) return;
    generationIdRef.current += 1;
    const thisGen = generationIdRef.current;
    setGeneratingCaptions(true); setCaptionError(null); setIsEditingCaption(false);
    const prevCaption = mode === "variations" ? carouselCaption : undefined;
    try {
      const tags = carouselItems.map((i) => i.tag ?? "other");
      const options = await generate3Captions(tags, appSettings.captionSettings, true, mode, prevCaption, undefined, captionUserIdeas);
      if (generationIdRef.current !== thisGen) return;
      setCaptionOptions(options);
      setCaptionSelectedIdx(null);
      setCaptionOptionsExpanded(true);
      if (mode === "fresh") setCarouselCaption("");
    } catch (err) { if (generationIdRef.current === thisGen) setCaptionError(err instanceof Error ? err.message : "Failed to generate"); }
    finally { if (generationIdRef.current === thisGen) setGeneratingCaptions(false); }
  }

  function handleSelectCaptionOption(idx: number) {
    if (!captionOptions) return;
    setCaptionSelectedIdx(idx);
    setCarouselCaption(captionOptions[idx]);
    setCaptionOptionsExpanded(false);
  }

  // ── Approve carousel ──
  async function handleApproveCarousel() {
    const finalCaption = isEditingCaption ? editingCaption : carouselCaption;
    const tags = carouselItems.map((i) => i.tag ?? "other");
    const effectiveDate = scheduleDate || todayStr();
    const postId = editingPost ? editingPost.id : generateId();
    if (editingPost) {
      setApprovedPosts((prev) => prev.filter((p) => p.id !== editingPost.id));
      try { await apiDelete(`/posts/${editingPost.id}`); } catch {}
      const remaining = approvedPosts.filter((p) => p.id !== editingPost.id);
      await reconcileAfterDelete(remaining, mediaItems);
      await markItemsUsed(carouselIds);
    } else {
      await markItemsUsed(carouselIds);
    }
    const post: ApprovedPost = {
      id: postId, day: effectiveDate, caption: finalCaption,
      tagsSummary: [...new Set(tags)].map(tagIcon).join(" "),
      slideCount: carouselItems.length, scheduledDate: effectiveDate,
      scheduledTime: scheduleTime || appSettings.defaultScheduleTime,
      mediaIds: carouselIds, createdAt: new Date().toISOString(),
    };
    setApprovedPosts((prev) => [post, ...prev]);
    setCarouselIds([]); setCarouselCaption(""); setCaptionOptions(null); setCaptionSelectedIdx(null);
    setEditingPost(null);
    try { await apiPost("/posts", post); } catch {}
    setScreen("calendar");
  }

  async function handleSaveDraft() {
    const finalCaption = isEditingCaption ? editingCaption : (carouselCaption ?? "");
    const tags = carouselItems.map((i) => i.tag ?? "other");
    const postId = editingPost ? editingPost.id : generateId();
    if (editingPost && editingPost.status === "draft") {
      setApprovedPosts((prev) => prev.filter((p) => p.id !== editingPost.id));
      try { await apiDelete(`/posts/${editingPost.id}`); } catch {}
    }
    const draft: ApprovedPost = {
      id: postId, day: scheduleDate || todayStr(), caption: finalCaption,
      tagsSummary: [...new Set(tags)].map(tagIcon).join(" "),
      slideCount: carouselItems.length,
      scheduledDate: scheduleDate || null,
      scheduledTime: scheduleTime || null,
      mediaIds: carouselIds,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    setApprovedPosts((prev) => [draft, ...prev.filter((p) => p.id !== postId)]);
    setCarouselIds([]); setCarouselCaption(""); setCaptionOptions(null); setCaptionSelectedIdx(null);
    setEditingPost(null); setTodayBuildMode(false);
    try { await apiPost("/posts", draft); } catch {}
    setScreen("calendar");
  }

  // ── Filmstrip drag ──
  const handleFilmPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, i: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointerDragRef.current?.timer) clearTimeout(pointerDragRef.current.timer);
    const startX = e.clientX, startY = e.clientY;
    pointerDragRef.current = { pointerId: e.pointerId, fromIndex: i, overIndex: i, startX, startY, active: false, timer: null };
    const timer = setTimeout(() => {
      if (pointerDragRef.current) { pointerDragRef.current.active = true; setFilmDragFrom(i); try { (navigator as any).vibrate?.(25); } catch {} }
    }, 300);
    pointerDragRef.current.timer = timer;
  }, []);
  const handleFilmPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = pointerDragRef.current; if (!drag) return;
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) > 8 || Math.abs(e.clientY - drag.startY) > 8) {
        if (drag.timer) clearTimeout(drag.timer); pointerDragRef.current = null; setFilmDragFrom(null); setFilmDragOver(null);
      }
      return;
    }
    if (!filmstripRef.current) return;
    const elems = filmstripRef.current.querySelectorAll("[data-film-idx]");
    for (let j = 0; j < elems.length; j++) {
      const rect = elems[j].getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) { drag.overIndex = j; setFilmDragOver(j); break; }
    }
  }, []);
  const handleFilmPointerUp = useCallback(() => {
    const drag = pointerDragRef.current; if (!drag) return;
    if (drag.timer) clearTimeout(drag.timer);
    if (drag.active && drag.fromIndex !== drag.overIndex) {
      const from = drag.fromIndex, to = drag.overIndex;
      setCarouselIds((prev) => reorder(prev, from, to));
      setCarouselIndex((ci) => {
        if (ci === from) return to;
        if (from < to && ci > from && ci <= to) return ci - 1;
        if (from > to && ci >= to && ci < from) return ci + 1;
        return ci;
      });
    }
    pointerDragRef.current = null; setFilmDragFrom(null); setFilmDragOver(null);
  }, []);
  const handleFilmPointerCancel = useCallback(() => {
    const drag = pointerDragRef.current;
    if (drag?.timer) clearTimeout(drag.timer);
    pointerDragRef.current = null; setFilmDragFrom(null); setFilmDragOver(null);
  }, []);

  function removeFromCarousel(i: number) {
    setCarouselIds((prev) => prev.filter((_, idx) => idx !== i));
    setCarouselIndex((ci) => Math.min(ci, Math.max(0, carouselIds.length - 2)));
  }

  // ── AI ──
  async function handleAIGenerateRuleBased() {
    setAiTypeModal(false); setAiError(null); setAiGenerating(true);
    try {
      const p = getAISourcePool();
      const targetCount = appSettings.carouselSize === "random"
        ? Math.floor(Math.random() * 10) + 3   // random 3–12
        : appSettings.carouselSize;
      let picked: MediaItem[];
      if (aiRuleBasedEnabled) {
        // Rule-based: Me-first, then preferred tags, then others
        const preferred = appSettings.preferredTags;
        const me = p.filter((m) => m.tag === "me");
        const friends = p.filter((m) => m.tag === "friends");
        const preferredPool = p.filter((m) => m.tag && preferred.includes(m.tag) && m.tag !== "me" && m.tag !== "friends");
        const other = p.filter((m) => m.tag && !preferred.includes(m.tag) && m.tag !== "me" && m.tag !== "friends");
        const result: MediaItem[] = [];
        if (me.length) result.push(me[0]);
        for (const item of [...friends, ...preferredPool, ...other]) {
          if (result.length >= targetCount) break;
          if (!result.find((x) => x.id === item.id)) result.push(item);
        }
        picked = result;
      } else {
        // Free-pick: just take the newest unused items from source
        picked = [...p].sort((a, b) => (a.createdAt ?? "") > (b.createdAt ?? "") ? -1 : 1).slice(0, targetCount);
      }
      if (picked.length < 2) { setAiError("Not enough media in source (need ≥2)."); setAiGenerating(false); return; }
      const ordered = aiRuleBasedEnabled
        ? buildCarouselOrder(mediaItems, picked.map((x) => x.id), appSettings.slideOrderRule, appSettings.tagSequence)
        : picked.map((x) => x.id);
      setCarouselIds(ordered); setCarouselIndex(0);
      setCarouselCaption(""); setCaptionOptions(null); setCaptionSelectedIdx(null);
      setCaptionError(null); setIsEditingCaption(false); setEditingPost(null);
      setScheduleDate(todayStr()); setScheduleTime(nowTimeStr());
      setDailyBadge(false); setDailyBanner(false); setScreen("carousel"); setTodayBuildMode(true);
      setGeneratingCaptions(true);
      const tags = ordered.map((id) => mediaMap[id]?.tag ?? "other");
      const options = await generate3Captions(tags, appSettings.captionSettings, true, "fresh");
      setCaptionOptions(options); setCaptionSelectedIdx(null); setCaptionOptionsExpanded(true);
    } catch (err) { setAiError(err instanceof Error ? err.message : "AI error"); }
    finally { setAiGenerating(false); setGeneratingCaptions(false); }
  }

  async function handleAIGenerateSingle() {
    setPlusMenuOpen(false); setAiError(null); setAiGenerating(true);
    try {
      const p = mediaItems.filter((m) => m.tag && !m.analyzing && !m.used);
      const best = p.find((m) => m.tag === "me") ?? p.find((m) => m.tag && appSettings.preferredTags.includes(m.tag)) ?? p[0];
      if (!best) { setAiError("No tagged unused media."); setAiGenerating(false); return; }
      setSinglePostItem(best); setSingleEditing(false); setSingleError(null);
      setSingleScheduleDate(todayStr()); setSingleScheduleTime(nowTimeStr());
      setSingleCaptionOptions(null); setSingleCaptionIdx(null); setSingleCaptionOptionsExpanded(false);
      setSingleCaption(await generateSingleCaption([best.tag ?? "other"], appSettings.captionSettings));
      setScreen("single");
    } catch (err) { setAiError(err instanceof Error ? err.message : "AI error"); setSinglePostItem(null); setScreen("pool"); }
    finally { setAiGenerating(false); }
  }

  // ── Settings ──
  async function saveSettingsToDB(s: AppSettings) {
    await Promise.all([
      apiPut("/settings/notificationTime", { value: s.notificationTime }),
      apiPut("/settings/defaultScheduleTime", { value: s.defaultScheduleTime }),
      apiPut("/settings/preferredTags", { value: JSON.stringify(s.preferredTags) }),
      apiPut("/settings/captionSettings", { value: JSON.stringify(s.captionSettings) }),
      apiPut("/settings/customTags", { value: JSON.stringify(s.customTags) }),
      apiPut("/settings/hiddenBaseTags", { value: JSON.stringify(s.hiddenBaseTags) }),
      apiPut("/settings/instagramUsername", { value: s.instagramUsername }),
      apiPut("/settings/aiCustomPreferences", { value: s.aiCustomPreferences }),
      apiPut("/settings/carouselSize", { value: JSON.stringify(s.carouselSize) }),
      apiPut("/settings/slideOrderRule", { value: JSON.stringify(s.slideOrderRule) }),
      apiPut("/settings/tagSequence", { value: JSON.stringify(s.tagSequence) }),
    ]);
  }
  async function handleSaveSettings() {
    setSettingsSaving(true); setSettingsSaved(false);
    try { await saveSettingsToDB(appSettings); setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2500); }
    catch (err) { console.error("Save settings failed:", err); }
    finally { setSettingsSaving(false); }
  }
  async function resetNotificationTime() {
    const next = { ...appSettings, notificationTime: DEFAULT_NOTIFICATION_TIME };
    setAppSettings(next);
    try { await apiPut("/settings/notificationTime", { value: DEFAULT_NOTIFICATION_TIME }); } catch {}
  }
  async function resetScheduleTime() {
    const next = { ...appSettings, defaultScheduleTime: DEFAULT_SCHEDULE_TIME };
    setAppSettings(next);
    try { await apiPut("/settings/defaultScheduleTime", { value: DEFAULT_SCHEDULE_TIME }); } catch {}
  }
  function addCustomTag() {
    const wordRaw = newTagInput.trim().replace(/\s+/g, " ").replace(/^[^\w\u00C0-\u017E\u4E00-\u9FFF\u3040-\u309F\uAC00-\uD7AF]+/, "");
    if (!wordRaw) return;
    const word = wordRaw.charAt(0).toUpperCase() + wordRaw.slice(1);
    const finalTag = `${tagInputEmoji} ${word}`;
    if (allAvailableTags.includes(finalTag)) return;
    setAppSettings((s) => ({ ...s, customTags: [...s.customTags, finalTag] }));
    setNewTagInput(""); setTagInputEmoji("🏷️");
  }

  // ── Delete post ──
  async function confirmDeletePost(post: ApprovedPost) {
    const remaining = approvedPosts.filter((p) => p.id !== post.id);
    setApprovedPosts(remaining);
    setDeleteConfirmPost(null);
    try { await apiDelete(`/posts/${post.id}`); } catch {}
    await reconcileAfterDelete(remaining, mediaItems);
  }

  function goToScreen(s: Screen) {
    setScreen(s);
    setPlusMenuOpen(false); // Fix 7: always close the + menu on nav
    if (s !== "carousel") setEditingPost(null);
    if (s === "carousel") {
      setDailyBadge(false); setDailyBanner(false);
      setTodayBuildMode(false); // Fix 1: nav to Today = overview mode
    }
  }

  // ─── Style shortcuts ───────────────────────────────────────────────────────
  const border = "border-[hsl(220,13%,18%)]";
  const card = `rounded-xl border ${border} bg-[hsl(220,14%,11%)]`;
  const dimText = "text-[hsl(220,10%,50%)]";
  const mutedBtn = `px-3 py-1.5 rounded-lg text-xs font-medium border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] transition-colors`;
  const activeNavCls = "bg-[hsl(263,70%,65%)/20] text-[hsl(263,70%,75%)] border border-[hsl(263,70%,65%)/30]";
  const inputCls = "bg-[hsl(220,14%,9%)] border border-[hsl(220,13%,22%)] rounded-lg px-3 py-2 text-sm text-[hsl(220,10%,85%)] focus:outline-none focus:border-[hsl(263,70%,65%)/50]";
  const SORT_LABELS: Record<PoolSort, string> = { latest: "Latest", oldest: "Oldest", name: "A–Z" };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[hsl(220,14%,8%)] text-[hsl(220,10%,95%)] font-sans">

      {/* NAV */}
      <nav className={`border-b ${border} px-4 py-3 flex items-center justify-between sticky top-0 z-20 bg-[hsl(220,14%,8%)]`}>
        <span className="text-base font-bold tracking-tight">📱 InstaFlow</span>
        <div className="flex items-center gap-1">
          {(["pool", "carousel", "calendar", "settings"] as Screen[]).map((s) => (
            <button key={s} onClick={() => goToScreen(s)}
              className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${screen === s ? activeNavCls : `${dimText} hover:text-[hsl(220,10%,80%)] hover:bg-[hsl(220,14%,14%)]`}`}>
              {s === "pool" ? "🗂 Pool" : s === "carousel" ? "📸 Today" : s === "calendar" ? "📅 Cal" : "⚙️"}
            </button>
          ))}
          <div className="relative ml-1">
            <button onClick={() => { setPlusMenuOpen((o) => !o); cancelSelection(); }}
              className={`relative w-8 h-8 rounded-lg bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white font-bold text-lg flex items-center justify-center ${aiGenerating ? "animate-pulse" : ""}`}>
              {plusMenuOpen ? "✕" : aiGenerating ? "…" : "+"}
              {dailyBadge && !plusMenuOpen && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-[hsl(220,14%,8%)]" />}
            </button>
            {plusMenuOpen && (
              <div className={`absolute right-0 top-10 w-60 rounded-xl border ${border} bg-[hsl(220,14%,12%)] shadow-xl overflow-hidden z-30`}>
                {[
                  { icon: "📸", label: "Build Carousel", sub: "Select 2–20 items", action: () => { goToScreen("pool"); enterSelectionMode("carousel"); } },
                  { icon: "🖼️", label: "Build Single Post", sub: "Select 1 image", action: () => { goToScreen("pool"); enterSelectionMode("single"); } },
                  { icon: "🤖", label: "AI Generate Carousel", sub: "Rule-based or by theme", action: () => { setPlusMenuOpen(false); setAiTypeModal(true); } },
                  { icon: "✨", label: "AI Generate Single", sub: "AI picks best image", action: handleAIGenerateSingle },
                ].map((item, idx, arr) => (
                  <button key={item.label} onClick={item.action}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-[hsl(220,14%,18%)] transition-colors ${idx < arr.length - 1 ? `border-b border-[hsl(220,13%,20%)]` : ""}`}>
                    <p className="font-medium">{item.icon} {item.label}</p>
                    <p className={`text-xs ${dimText} mt-0.5`}>{item.sub}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      {aiError && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-300">⚠️ {aiError}</p>
          <button onClick={() => setAiError(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}
      {dailyBanner && (
        <div className="bg-[hsl(263,70%,65%)/15] border-b border-[hsl(263,70%,65%)/30] px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-[hsl(263,70%,75%)]">📸 Your daily carousel is ready to build!</p>
          <div className="flex gap-2">
            <button onClick={() => goToScreen("carousel")} className="text-xs px-3 py-1 rounded-lg bg-[hsl(263,70%,65%)] text-white font-medium">View</button>
            <button onClick={() => setDailyBanner(false)} className={`text-xs ${dimText}`}>✕</button>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-6">

        {/* ════ POOL ════ */}
        {screen === "pool" && (
          <div className={`space-y-4 ${bulkMode || selectionMode ? "pb-44" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Media Pool</h1>
                <p className={`${dimText} text-sm`}>
                  {bulkMode
                    ? `${bulkSelectedIds.length === 0 ? "Tap to select" : `${bulkSelectedIds.length} selected`}`
                    : selectionMode
                    ? selectionMode === "carousel" ? `Select 2–20 items (${selectedIds.length} chosen)` : "Select 1 image"
                    : "Tap to view · long-press to select."}
                </p>
              </div>
              {!selectionMode && !bulkMode && (
                <div className="flex items-center gap-2">
                  {mediaItems.length > 0 && !openFolder && (
                    <button onClick={() => { setBulkMode(true); setBulkSelectedIds([]); }}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] transition-colors`}>
                      Select
                    </button>
                  )}
                  <button onClick={() => fileInputRef.current?.click()} className={mutedBtn}>+ Upload</button>
                </div>
              )}
              {bulkMode && (
                <button onClick={cancelBulkMode} className={`text-sm font-medium ${dimText} hover:text-white`}>Cancel</button>
              )}
            </div>

            {/* ── Pool header: compact 2 rows ── */}
            {!mediaLoading && mediaItems.length > 0 && (
              <div className="space-y-2">
                {/* Row 1: All / Used tabs + count */}
                <div className="flex items-center gap-2">
                  <button onClick={() => { setUsedFilter("active"); setActiveFilters([]); setOpenFolder(null); setFolderAddMode(false); }}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${usedFilter === "active" ? activeNavCls : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                    All
                  </button>
                  {mediaItems.some((m) => m.used) && (
                    <button onClick={() => { setUsedFilter("used"); setActiveFilters([]); setFilterDropdownOpen(false); setSortDropdownOpen(false); setOpenFolder(null); setFolderAddMode(false); }}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${usedFilter === "used" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                      ✓ Used
                    </button>
                  )}
                  <span className={`text-xs ${dimText} ml-auto`}>{filteredSortedMedia.length} items</span>
                </div>

                {/* Row 2: Filter + Sort (only on All tab) / Sub-filters (on Used tab) */}
                {usedFilter === "active" ? (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button onClick={() => { setFilterDropdownOpen((o) => !o); setSortDropdownOpen(false); }}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${activeFilters.length > 0 ? activeNavCls : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                        🏷️ {activeFilters.length > 0 ? `Filtered (${activeFilters.length})` : "Filter by Tag"} ▾
                      </button>
                      {filterDropdownOpen && (
                        <div className={`absolute top-9 left-0 z-20 w-52 rounded-xl border ${border} bg-[hsl(220,14%,13%)] shadow-xl py-1`}>
                          <button onClick={() => setActiveFilters([])}
                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[hsl(220,14%,18%)] ${activeFilters.length === 0 ? "text-[hsl(263,70%,75%)]" : dimText}`}>
                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${activeFilters.length === 0 ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)]" : "border-[hsl(220,13%,30%)]"}`}>
                              {activeFilters.length === 0 && <span className="text-white text-[9px]">✓</span>}
                            </span>
                            All tags
                          </button>
                          <div className={`border-t ${border} my-0.5`} />
                          {tagsInActivePool.map((tag) => {
                            const on = activeFilters.includes(tag);
                            return (
                              <button key={tag} onClick={() => setActiveFilters((prev) => on ? prev.filter((t) => t !== tag) : [...prev, tag])}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[hsl(220,14%,18%)] ${on ? "text-[hsl(263,70%,75%)]" : dimText}`}>
                                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${on ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)]" : "border-[hsl(220,13%,30%)]"}`}>
                                  {on && <span className="text-white text-[9px]">✓</span>}
                                </span>
                                {tagIcon(tag)} {tagLabel(tag)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="relative ml-auto">
                      <button onClick={() => { setSortDropdownOpen((o) => !o); setFilterDropdownOpen(false); }}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1 ${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}>
                        ↕ {SORT_LABELS[poolSort]} ▾
                      </button>
                      {sortDropdownOpen && (
                        <div className={`absolute top-9 right-0 z-20 w-40 rounded-xl border ${border} bg-[hsl(220,14%,13%)] shadow-xl py-1`}>
                          {(["latest", "oldest", "name"] as PoolSort[]).map((s) => (
                            <button key={s} onClick={() => { setPoolSort(s); setSortDropdownOpen(false); }}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[hsl(220,14%,18%)] ${poolSort === s ? "text-[hsl(263,70%,75%)]" : dimText}`}>
                              <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${poolSort === s ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)]" : "border-[hsl(220,13%,30%)]"}`}>
                                {poolSort === s && <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />}
                              </span>
                              {SORT_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Used tab sub-filters
                  <div className="flex items-center gap-2">
                    {(["all", "scheduled", "posted"] as const).map((sf) => (
                      <button key={sf} onClick={() => setUsedSubFilter(sf)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${usedSubFilter === sf ? activeNavCls : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                        {sf === "all" ? "All" : sf === "scheduled" ? "🕐 Scheduled" : "✓ Published"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Folder view header ── */}
            {openFolder && (
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <button onClick={() => { setOpenFolder(null); setFolderAddMode(false); }} className={`${dimText} hover:text-white text-sm`}>← Back</button>
                  <span className="text-sm font-semibold">📁 {openFolder.name}</span>
                  <span className={`text-xs ${dimText}`}>({openFolder.mediaIds.filter((id) => mediaMap[id]).length})</span>
                </div>
                <div className="flex items-center gap-3">
                  {folderAddMode && (
                    <button onClick={() => setFolderAddMode(false)} className={`text-xs px-2.5 py-1 rounded-lg bg-[hsl(263,70%,65%)/20] text-[hsl(263,70%,75%)] border border-[hsl(263,70%,65%)/30]`}>Done Adding</button>
                  )}
                  <button onClick={() => setConfirmDeleteFolder(true)} className={`text-xs ${dimText} hover:text-red-400`}>Delete folder</button>
                </div>
              </div>
            )}
            {/* Folder add-mode banner — multi-select then confirm */}
            {openFolder && folderAddMode && (
              <div className="rounded-xl border border-[hsl(263,70%,65%)/30] bg-[hsl(263,70%,65%)/8] px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <p className={`text-xs text-[hsl(263,70%,70%)]`}>
                    {folderPendingIds.length === 0 ? `Tap items to select for "${openFolder.name}"` : `${folderPendingIds.length} selected`}
                  </p>
                  <button onClick={() => { setFolderAddMode(false); setFolderPendingIds([]); }} className={`text-xs ${dimText} hover:text-white`}>Cancel</button>
                </div>
                {folderPendingIds.length > 0 && (
                  <button
                    onClick={() => {
                      handleAddToFolder(openFolder.id, folderPendingIds);
                      setFolderPendingIds([]);
                      setFolderAddMode(false);
                    }}
                    className="w-full py-1.5 rounded-lg bg-[hsl(263,70%,65%)] text-white text-xs font-semibold">
                    Add {folderPendingIds.length} item{folderPendingIds.length !== 1 ? "s" : ""} to Folder
                  </button>
                )}
              </div>
            )}

            {/* Media grid or used groups */}
            {mediaLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-[hsl(220,14%,13%)] animate-pulse" />)}
              </div>
            ) : mediaItems.length === 0 ? (
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[hsl(220,13%,22%)] hover:border-[hsl(263,70%,65%)/50] rounded-2xl p-10 text-center cursor-pointer transition-colors bg-[hsl(220,14%,10%)]">
                <span className="text-4xl">📁</span>
                <p className={`text-sm ${dimText} mt-2`}>Click to upload photos or videos</p>
              </div>
            ) : usedFilter === "used" ? (
              <div className="space-y-5">
                {usedGroupedByPost.length === 0 ? (
                  <p className={`text-center py-10 ${dimText} text-sm`}>No used items in this category.</p>
                ) : (
                  usedGroupedByPost.map(({ post, items, weekLabel }, gi) => {
                    const sc = post ? postStatusClasses(post) : null;
                    const d = post ? (post.scheduledDate ?? post.day) : null;
                    return (
                      <div key={post?.id ?? `unassigned_${gi}`}>
                        {weekLabel && <p className={`text-[10px] font-medium ${dimText} uppercase tracking-wider mb-2`}>{weekLabel}</p>}
                        {post ? (
                          <div className={`w-full rounded-xl border ${sc?.card} bg-[hsl(220,14%,11%)] px-3 py-2 mb-2`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex-shrink-0 text-sm">{getPostStatus(post) === "scheduled" ? "🕐" : "✓"}</span>
                              {d && <span className={`flex-shrink-0 text-xs ${dimText}`}>{formatDayShort(d)}{post.scheduledTime ? ` · ${post.scheduledTime}` : ""}</span>}
                              {post.caption && <p className={`text-xs ${dimText} truncate flex-1 min-w-0`}>{post.caption}</p>}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button onClick={() => { setPreviewPost(post); setPreviewSlide(0); }} className={`text-xs ${dimText} hover:text-white`}>👁</button>
                                <button onClick={() => openPostForEdit(post, "used")} className={`text-xs ${dimText} hover:text-white`}>✏️</button>
                                <button onClick={() => setDeleteConfirmPost(post)} className={`text-xs ${dimText} hover:text-red-400`}>🗑</button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className={`text-xs ${dimText} font-medium px-0.5 mb-2`}>Other used images</p>
                        )}
                        <div className="grid grid-cols-4 gap-1.5">
                          {items.map((item) => (
                            <div key={item.id} className="relative rounded-lg overflow-hidden aspect-square opacity-75">
                              {isVideo(item.dataUrl) ? <video src={item.dataUrl} className="w-full h-full object-cover" preload="none" /> : brokenImages.has(item.id) ? <div className="w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center text-2xl">{tagIcon(item.tag ?? "other")}</div> : <img src={item.dataUrl} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={() => setBrokenImages((p) => new Set([...p, item.id]))} />}
                              {item.tag && <span className={`absolute bottom-0.5 left-0.5 text-[8px] px-1 py-0.5 rounded backdrop-blur-sm ${tagColor(item.tag, appSettings.customTags)}`}>{tagIcon(item.tag)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* ── Folder fan row (only in top-level active view) ── */}
                {!openFolder && usedFilter === "active" && activeFilters.length === 0 && folders.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {folders.map((folder) => {
                      const imgs = folder.mediaIds.slice(0, 3).map((id) => mediaMap[id]).filter(Boolean) as MediaItem[];
                      return (
                        <div key={folder.id} className="relative aspect-square cursor-pointer group"
                          onClick={() => { if (!longPressFolder) setOpenFolder(folder); }}
                          onPointerDown={(e) => { const t = setTimeout(() => { setLongPressFolder(folder); }, 500); (e.currentTarget as HTMLElement).dataset.lpt = String(t); }}
                          onPointerUp={(e) => { clearTimeout(Number((e.currentTarget as HTMLElement).dataset.lpt)); }}
                          onPointerLeave={(e) => { clearTimeout(Number((e.currentTarget as HTMLElement).dataset.lpt)); }}>
                          {imgs[2] && (
                            <div className="absolute inset-0 rounded-xl overflow-hidden border border-[hsl(220,13%,25%)]"
                              style={{ transform: "rotate(-7deg) scale(0.92)", zIndex: 1, opacity: 0.75 }}>
                              <img src={imgs[2].dataUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                            </div>
                          )}
                          {imgs[1] && (
                            <div className="absolute inset-0 rounded-xl overflow-hidden border border-[hsl(220,13%,25%)]"
                              style={{ transform: "rotate(-3.5deg) scale(0.96)", zIndex: 2, opacity: 0.88 }}>
                              <img src={imgs[1].dataUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="absolute inset-0 rounded-xl overflow-hidden border-2 border-[hsl(220,13%,28%)] group-hover:border-[hsl(263,70%,65%)/60] transition-all"
                            style={{ zIndex: 3 }}>
                            {imgs[0]
                              ? <img src={imgs[0].dataUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                              : <div className="w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center"><span className="text-3xl">📁</span></div>}
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-6 rounded-b-xl">
                            <p className="text-white text-[10px] font-semibold truncate leading-tight">{folder.name}</p>
                            {(() => { const cnt = folder.mediaIds.filter((id) => mediaMap[id]).length; return <p className="text-white/55 text-[8px]">{cnt} item{cnt !== 1 ? "s" : ""}</p>; })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Compact "+ New Folder" button (above main grid) ── */}
                {!openFolder && usedFilter === "active" && !bulkMode && !selectionMode && (
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${dimText}`}>{filteredSortedMedia.length} item{filteredSortedMedia.length !== 1 ? "s" : ""}</span>
                    <button onClick={() => setCreateFolderOpen(true)}
                      className={`text-xs flex items-center gap-1 px-2.5 py-1 rounded-lg border ${border} ${dimText} hover:text-white hover:border-[hsl(263,70%,65%)/40] transition-colors`}>
                      📁 + New Folder
                    </button>
                  </div>
                )}

              <div className="grid grid-cols-3 gap-2" onClick={selectionMode ? cancelSelection : undefined}>

                {/* ── Media items ── */}
                {(() => {
                  // Fix 2: in folderAddMode show pool items not already in the folder
                  const displayItems = openFolder
                    ? (folderAddMode
                        ? mediaItems.filter((m) => !openFolder.mediaIds.includes(m.id) && !m.used)
                        : mediaItems.filter((m) => openFolder.mediaIds.includes(m.id)))
                    : filteredSortedMedia;
                  if (displayItems.length === 0 && !openFolder) return (
                    <div className={`col-span-3 text-center py-10 ${dimText} text-sm`}>No items match these filters.</div>
                  );
                  if (displayItems.length === 0 && openFolder && folderAddMode) return (
                    <div className={`col-span-3 text-center py-8 ${dimText} text-sm`}>
                      <p>All pool items are already in this folder.</p>
                    </div>
                  );
                  if (displayItems.length === 0 && openFolder) return (
                    <div className={`col-span-3 text-center py-8 ${dimText} text-sm`}>
                      <p>This folder is empty.</p>
                      <p className="text-xs mt-1">Tap "+ Add Media" above or long-press in the pool.</p>
                    </div>
                  );
                  return displayItems.map((item) => {
                    const isSelected = selectionMode ? selectedIds.includes(item.id) : bulkMode ? bulkSelectedIds.includes(item.id) : false;
                    return (
                      <div key={item.id}
                        onPointerDown={(e) => { clearLongPress(); startPoolLongPress(item, e, !!(openFolder && !folderAddMode)); }}
                        onPointerMove={checkLongPressMove}
                        onPointerUp={clearLongPress}
                        onPointerCancel={clearLongPress}
                        onClick={(e) => {
                          if (longPressFired.current) { longPressFired.current = false; return; }
                          if (bulkMode) { e.stopPropagation(); setBulkSelectedIds((prev) => prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]); return; }
                          if (openFolder && folderAddMode) {
                            e.stopPropagation();
                            setFolderPendingIds((prev) => prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]);
                            return;
                          }
                          if (openFolder && !folderAddMode) {
                            e.stopPropagation();
                            setViewerItem(item);
                            return;
                          }
                          if (selectionMode) { e.stopPropagation(); toggleSelect(item.id); return; }
                          setViewerItem(item);
                        }}
                        className={`relative rounded-xl overflow-hidden aspect-square cursor-pointer transition-all select-none
                          ${(selectionMode && isSelected) || (bulkMode && isSelected) ? "ring-2 ring-[hsl(263,70%,65%)]" : ""}
                          ${(openFolder && folderAddMode && folderPendingIds.includes(item.id)) ? "ring-2 ring-emerald-400" : ""}
                          ${bulkMode && !isSelected ? "opacity-70" : ""}`}>
                        {isVideo(item.dataUrl)
                          ? <div className="w-full h-full relative">{videoPosters[item.id] ? <img src={videoPosters[item.id]} alt={item.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[hsl(220,14%,16%)]" />}<span className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white text-sm">▶</span></span></div>
                          : brokenImages.has(item.id) ? <div className="w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center text-3xl">{tagIcon(item.tag ?? "other")}</div> : <img src={item.dataUrl} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={() => setBrokenImages((p) => new Set([...p, item.id]))} />}
                        {item.analyzing && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><span className="text-xs text-white animate-pulse">Analyzing…</span></div>}
                        {!item.analyzing && !bulkMode && !folderAddMode && (
                          <button onClick={(e) => { e.stopPropagation(); setTagPickerItem(item); }}
                            className={`absolute bottom-1 left-1 text-[9px] px-1.5 py-0.5 rounded border backdrop-blur-sm ${item.tag ? tagColor(item.tag, appSettings.customTags) : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"}`}>
                            {item.tag ? `${tagIcon(item.tag)} ${tagLabel(item.tag)}` : "＋ Tag"}
                          </button>
                        )}
                        {(selectionMode || bulkMode) && (
                          <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)]" : "border-white/60 bg-black/30"}`}>
                            {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                          </div>
                        )}
                        {openFolder && folderAddMode && (
                          <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${folderPendingIds.includes(item.id) ? "bg-emerald-400 border-emerald-400" : "border-white/60 bg-black/30"}`}>
                            {folderPendingIds.includes(item.id) && <span className="text-white text-[10px] font-bold">✓</span>}
                          </div>
                        )}
                        {selectionMode === "carousel" && isSelected && (
                          <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-[hsl(263,70%,65%)] flex items-center justify-center">
                            <span className="text-white text-[9px] font-bold">{selectedIds.indexOf(item.id) + 1}</span>
                          </div>
                        )}
                        {bulkMode && isSelected && (
                          <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">
                            <span className="text-black text-[9px] font-bold">{bulkSelectedIds.indexOf(item.id) + 1}</span>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}

                {/* "+ Add Media" tile in folder view → shows source picker */}
                {openFolder && !folderAddMode && !bulkMode && !selectionMode && (
                  <button
                    onClick={() => setFolderAddSourceSheet(true)}
                    className="aspect-square rounded-xl border-2 border-dashed border-[hsl(220,13%,28%)] hover:border-[hsl(263,70%,65%)/50] flex flex-col items-center justify-center gap-1 text-[hsl(220,10%,40%)] hover:text-[hsl(263,70%,70%)] transition-colors cursor-pointer">
                    <span className="text-2xl font-light leading-none">+</span>
                    <span className="text-[10px] font-medium">Add Media</span>
                  </button>
                )}
              </div>

              {/* ── Load More button (only in main pool, not inside a folder) ── */}
              {!openFolder && mediaHasMore && (
                <button
                  onClick={loadMoreMedia}
                  disabled={mediaLoadingMore}
                  className="w-full mt-2 py-3 rounded-xl border border-[hsl(220,13%,22%)] text-sm text-[hsl(220,10%,55%)] hover:text-white hover:border-[hsl(220,13%,35%)] transition-colors disabled:opacity-50">
                  {mediaLoadingMore ? "Loading…" : "Load More"}
                </button>
              )}
              </div>
            )}
          </div>
        )}

        {/* ════ CAROUSEL / TODAY ════ */}
        {screen === "carousel" && (
          <div className="space-y-5">

            {/* ────────────────── TODAY OVERVIEW (no active build) ────────────────── */}
            {!todayBuildMode && !editingPost && (() => {
              const todayPosts = postsByDate[todayStr()] ?? [];
              return (
                <>
                  {/* Date header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-xl font-bold">Today</h1>
                      <p className={`${dimText} text-sm`}>{formatDay(todayStr())}</p>
                    </div>
                    <button onClick={() => setAiTypeModal(true)} className={`text-xs px-3 py-1.5 rounded-xl border ${border} ${dimText} hover:text-white hover:bg-[hsl(220,14%,16%)] transition-colors flex items-center gap-1.5`}>🤖 AI Create</button>
                  </div>

                  {todayPosts.length === 0 ? (
                    /* Empty state — large centered "+" */
                    <button
                      onClick={() => { setTodayBuildMode(true); goToScreen("pool"); enterSelectionMode("carousel"); }}
                      className={`w-full ${card} flex flex-col items-center justify-center gap-3 py-16 hover:bg-[hsl(220,14%,14%)] transition-colors group`}>
                      <div className="w-16 h-16 rounded-full border-2 border-dashed border-[hsl(263,70%,65%)/50] group-hover:border-[hsl(263,70%,65%)] flex items-center justify-center transition-colors">
                        <span className="text-3xl font-light text-[hsl(263,70%,65%)]">+</span>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-[hsl(220,10%,85%)]">Create Post</p>
                        <p className={`text-xs ${dimText} mt-0.5`}>No posts scheduled for today</p>
                      </div>
                    </button>
                  ) : (
                    /* Posts list */
                    <div className="space-y-3">
                      {todayPosts.map((post) => {
                        const sc = postStatusClasses(post);
                        const thumb = (post.mediaIds ?? []).map((id) => mediaMap[id]).find(Boolean);
                        return (
                          <div key={post.id} className={`${card} border ${sc.card} overflow-hidden`}>
                            <div className="flex items-stretch">
                              {thumb && (
                                <div className="w-20 flex-shrink-0 overflow-hidden relative">
                                  {isVideo(thumb.dataUrl)
                                    ? <>{videoPosters[thumb.id] ? <img src={videoPosters[thumb.id]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[hsl(220,14%,16%)]" />}<span className="absolute inset-0 flex items-center justify-center"><span className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white text-xs">▶</span></span></>
                                    : <img src={thumb.dataUrl} alt="" className="w-full h-full object-cover" />}
                                </div>
                              )}
                              <div className="flex-1 px-3 py-3 space-y-1.5 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                                    <span className={`text-xs ${dimText}`}>{post.slideCount === 1 ? "Single" : `${post.slideCount} slides`}</span>
                                    {post.scheduledTime && <span className={`text-xs ${dimText}`}>🕐 {post.scheduledTime}</span>}
                                  </div>
                                  <div className="flex gap-2 items-center flex-shrink-0">
                                    <button onClick={() => { setPreviewPost(post); setPreviewSlide(0); }} className={`text-xs ${dimText} hover:text-white`}>👁</button>
                                    <button onClick={() => openPostForEdit(post)} className={`text-xs ${dimText} hover:text-[hsl(263,70%,70%)]`}>✏️</button>
                                    <button onClick={() => setDeleteConfirmPost(post)} className={`text-xs ${dimText} hover:text-red-400`}>🗑</button>
                                  </div>
                                </div>
                                {post.caption && <p className={`text-xs ${dimText} line-clamp-2 leading-relaxed`}>{post.caption}</p>}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Smaller "Create Post" below existing posts */}
                      <button
                        onClick={() => { setTodayBuildMode(true); goToScreen("pool"); enterSelectionMode("carousel"); }}
                        className={`w-full py-3 rounded-xl border border-dashed ${border} ${dimText} hover:border-[hsl(263,70%,65%)/50] hover:text-[hsl(263,70%,70%)] transition-colors flex items-center justify-center gap-2 text-sm font-medium`}>
                        <span className="text-base">+</span> Create Another Post
                      </button>
                    </div>
                  )}
                </>
              );
            })()}

            {/* ────────────────── CAROUSEL BUILDER (active build or edit) ────────────────── */}
            {(todayBuildMode || editingPost) && (<>

            {/* Builder header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">{editingPost ? "Edit Post" : "New Post"}</h1>
                <p className={`${dimText} text-sm`}>{editingPost ? `Editing · ${carouselItems.length} slide${carouselItems.length !== 1 ? "s" : ""}` : `${formatDay(todayStr())} · ${carouselItems.length} slide${carouselItems.length !== 1 ? "s" : ""}`}</p>
              </div>
              <div className="flex items-center gap-2">
                {editingPost && (
                  <button onClick={() => setDeleteConfirmPost(editingPost)} className={`text-xs px-3 py-1.5 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/10 transition-colors`}>Delete</button>
                )}
                <button
                  onClick={() => attemptCancel(() => {
                    setCarouselIds([]); setCarouselCaption(""); setCaptionOptions(null); setCaptionSelectedIdx(null);
                    setIsEditingCaption(false); setEditingPost(null); setTodayBuildMode(false);
                    if (editingPost && editingFrom === "used") {
                      setUsedFilter("used"); goToScreen("pool");
                    } else {
                      goToScreen(editingPost ? "calendar" : "carousel");
                    }
                  })}
                  className={mutedBtn}
                >Cancel</button>
              </div>
            </div>

            {/* 1. MAIN VIEWER + 2. FILMSTRIP (same card) */}
            <div className={`${card} overflow-visible`}>
              {/* 4:5 viewer */}
              <div className="relative overflow-hidden rounded-t-xl" style={{ aspectRatio: "4/5" }} onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
                {currentSlide ? (
                  <>
                    {isVideo(currentSlide.dataUrl) ? (
                      playingVideoId === currentSlide.id
                        ? <video src={currentSlide.dataUrl} className="w-full h-full object-cover" autoPlay loop muted onClick={() => setPlayingVideoId(null)} />
                        : <div className="w-full h-full relative cursor-pointer" onClick={() => setPlayingVideoId(currentSlide.id)}>
                            {videoPosters[currentSlide.id] ? <img src={videoPosters[currentSlide.id]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-black" />}
                            <div className="absolute inset-0 flex items-center justify-center"><div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"><span className="text-white text-2xl ml-1">▶</span></div></div>
                          </div>
                    ) : <img src={currentSlide.dataUrl} alt="" className="w-full h-full object-cover" />}
                    {currentSlide.tag && <span className={`absolute top-3 left-3 text-xs px-2 py-0.5 rounded-lg border backdrop-blur-sm ${tagColor(currentSlide.tag, appSettings.customTags)}`}>{tagIcon(currentSlide.tag)} {tagLabel(currentSlide.tag)}</span>}
                    <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-lg bg-black/50 text-white backdrop-blur-sm">{carouselIndex + 1} / {carouselItems.length}</span>
                    {carouselIndex > 0 && <button onClick={() => setCarouselIndex((i) => i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center">‹</button>}
                    {carouselIndex < carouselItems.length - 1 && <button onClick={() => setCarouselIndex((i) => i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center">›</button>}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[hsl(220,14%,9%)]">
                    <p className={`text-sm ${dimText}`}>Tap + below to add slides</p>
                  </div>
                )}
              </div>

              {/* 2. FILMSTRIP */}
              <div
                ref={filmstripRef}
                onTouchStart={(e) => {
                  if (filmDragFrom !== null) return;
                  touchScrollRef.current = { startX: e.touches[0].clientX, startScrollLeft: filmstripRef.current?.scrollLeft ?? 0, active: true };
                }}
                onTouchMove={(e) => {
                  const ts = touchScrollRef.current;
                  if (!ts.active || filmDragFrom !== null || !filmstripRef.current) return;
                  filmstripRef.current.scrollLeft = ts.startScrollLeft + (ts.startX - e.touches[0].clientX);
                }}
                onTouchEnd={() => { touchScrollRef.current.active = false; }}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  overflowX: "scroll",
                  overflowY: "visible",
                  WebkitOverflowScrolling: "touch",
                  scrollSnapType: "x mandatory",
                  whiteSpace: "nowrap",
                  scrollbarWidth: "none",
                  columnGap: 8,
                  padding: 12,
                } as React.CSSProperties}
              >
                {filmDisplayIds.map((id, displayIdx) => {
                  const item = mediaMap[id];
                  if (!item) return null;
                  const originalIdx = carouselIds.indexOf(id);
                  const isDragging = filmDragFrom !== null && originalIdx === filmDragFrom;
                  const isSelected = carouselIds[carouselIndex] === id && !isDragging;
                  return (
                    <div key={id} data-film-idx={displayIdx}
                      onPointerDown={(e) => handleFilmPointerDown(e, originalIdx)}
                      onPointerMove={handleFilmPointerMove}
                      onPointerUp={handleFilmPointerUp}
                      onPointerCancel={handleFilmPointerCancel}
                      onClick={() => !pointerDragRef.current?.active && setCarouselIndex(originalIdx)}
                      style={{
                        width: 84, height: 84,
                        flexShrink: 0,
                        display: "inline-block",
                        scrollSnapAlign: "start",
                        touchAction: "none",
                        position: "relative", borderRadius: 10, overflow: "hidden",
                        transform: isDragging ? "scale(0.9) translateY(3px)" : "scale(1) translateY(0)",
                        transition: isDragging ? "none" : "transform 180ms cubic-bezier(0.34,1.56,0.64,1)",
                        zIndex: isDragging ? 50 : 1,
                        boxShadow: isDragging ? "0 12px 24px rgba(0,0,0,0.6), 0 0 0 2.5px hsl(263,70%,65%)" : isSelected ? "0 0 0 2.5px hsl(263,70%,65%)" : "none",
                        outline: isSelected || isDragging ? "2px solid hsl(263,70%,65%)" : "2px solid transparent",
                        opacity: isSelected || isDragging ? 1 : 0.75,
                        cursor: "grab",
                      } as React.CSSProperties}>
                      {isVideo(item.dataUrl)
                        ? <>{videoPosters[item.id] ? <img src={videoPosters[item.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /> : <div style={{ width: "100%", height: "100%", background: "hsl(220,14%,16%)" }} />}<span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 9 }}>▶</span></span></>
                        : brokenImages.has(item.id) ? <div style={{ width: "100%", height: "100%", background: "hsl(220,14%,16%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{tagIcon(item.tag ?? "other")}</div> : <img src={item.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} onError={() => setBrokenImages((p) => new Set([...p, item.id]))} />}
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); removeFromCarousel(originalIdx); }}
                        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, background: "rgba(0,0,0,0.8)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, touchAction: "auto" }}>
                        <span style={{ color: "white", fontSize: 10, lineHeight: 1 }}>✕</span>
                      </button>
                      <div style={{ position: "absolute", bottom: 4, left: 6 }}><span style={{ color: "white", fontSize: 9, fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{displayIdx + 1}</span></div>
                    </div>
                  );
                })}
                {/* "+" tile — always last, always visible */}
                {carouselIds.length < MAX_CAROUSEL && (
                  <button
                    onClick={() => setAddMoreOpen(true)}
                    style={{
                      width: 84, height: 84,
                      flexShrink: 0,
                      display: "inline-flex",
                      scrollSnapAlign: "start",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      borderRadius: 10,
                      border: "2px dashed hsl(220,13%,32%)",
                      background: "hsl(220,14%,9%)",
                      color: "hsl(220,10%,40%)",
                      cursor: "pointer",
                    } as React.CSSProperties}>
                    <span style={{ fontSize: 24, fontWeight: 300, lineHeight: 1 }}>+</span>
                    <span style={{ fontSize: 9, fontWeight: 500 }}>{carouselIds.length === 0 ? "Add slides" : "Add more"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* 3. SELECTED CAPTION DISPLAY (Fix 6) */}
            {carouselItems.length > 0 && carouselCaption && !isEditingCaption && (
              <div className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-[hsl(220,10%,85%)] leading-relaxed whitespace-pre-wrap flex-1">{carouselCaption}</p>
                  <button onClick={() => { setEditingCaption(carouselCaption); setIsEditingCaption(true); }} className={`text-xs px-2 py-1 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] flex-shrink-0`}>✏️</button>
                </div>
                <div className="flex gap-2 mt-2.5 flex-wrap">
                  <button onClick={() => handleGetCaptionOptions("variations")} disabled={generatingCaptions} className="text-xs px-2.5 py-1 rounded-lg bg-[hsl(263,70%,65%)/15] text-[hsl(263,70%,70%)] border border-[hsl(263,70%,65%)/25] hover:bg-[hsl(263,70%,65%)/25] disabled:opacity-40">{generatingCaptions ? "…" : "↺ Variations"}</button>
                  <button onClick={() => handleGetCaptionOptions("fresh")} disabled={generatingCaptions} className={`text-xs px-2.5 py-1 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] disabled:opacity-40`}>🆕 New Caption</button>
                </div>
              </div>
            )}
            {carouselItems.length > 0 && isEditingCaption && (
              <div className={`${card} p-4 space-y-2`}>
                <p className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Edit Caption</p>
                <textarea value={editingCaption} onChange={(e) => setEditingCaption(e.target.value)} rows={4} autoFocus
                  className="w-full bg-[hsl(220,14%,9%)] border border-[hsl(263,70%,65%)/40] rounded-xl p-3 text-sm text-[hsl(220,10%,85%)] resize-none focus:outline-none focus:border-[hsl(263,70%,65%)/70]" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setIsEditingCaption(false)} className={mutedBtn}>Cancel</button>
                  <button onClick={() => { setCarouselCaption(editingCaption); setIsEditingCaption(false); }} className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(263,70%,65%)] text-white">Save</button>
                </div>
              </div>
            )}

            {/* 4. CAPTION OPTIONS (Fix 6) */}
            {carouselItems.length > 0 && (
              <div className={`${card} p-5 space-y-3`}>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => captionOptions && !generatingCaptions && setCaptionOptionsExpanded((v) => !v)}
                    className="flex items-center gap-2 group"
                    disabled={!captionOptions || generatingCaptions}>
                    <span className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Caption Options</span>
                    {captionOptions && !generatingCaptions && (
                      <span className={`text-[hsl(220,10%,45%)] text-xs transition-transform duration-200 ${captionOptionsExpanded ? "rotate-180" : "rotate-0"}`} style={{ display: "inline-block" }}>▾</span>
                    )}
                  </button>
                  {captionOptions && !generatingCaptions && (
                    <button onClick={() => handleGetCaptionOptions("fresh")}
                      className={`text-xs px-2.5 py-1 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}>
                      🆕 New
                    </button>
                  )}
                </div>
                {/* User ideas input */}
                <div>
                  <label className={`block text-[10px] font-medium ${dimText} mb-1 uppercase tracking-wider`}>Your ideas (optional)</label>
                  <textarea
                    value={captionUserIdeas}
                    onChange={(e) => setCaptionUserIdeas(e.target.value)}
                    placeholder="e.g. mention the rooftop, reference the music, add something about tonight…"
                    rows={2}
                    className={`w-full bg-[hsl(220,14%,9%)] border ${border} focus:border-[hsl(263,70%,65%)/60] rounded-xl px-3 py-2 text-xs text-[hsl(220,10%,80%)] resize-none focus:outline-none placeholder:text-[hsl(220,10%,35%)] transition-colors`}
                  />
                </div>
                {captionError && (
                  <div className="flex items-center justify-between gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <span>⚠️ Couldn't generate captions. Please try again.</span>
                    <button onClick={() => handleGetCaptionOptions("fresh")} className="flex-shrink-0 px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium">↺ Try Again</button>
                  </div>
                )}
                {generatingCaptions ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <p className={`text-sm ${dimText} animate-pulse`}>✨ Generating 3 caption options…</p>
                    <button onClick={cancelAIGeneration} className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">✕ Cancel</button>
                  </div>
                ) : captionOptions ? (
                  captionOptionsExpanded ? (
                    <div className="space-y-2">
                      <p className={`text-xs ${dimText}`}>Tap a style to use it as your caption:</p>
                      {captionOptions.map((opt, i) => {
                        const labels = ["Minimal / cool", "Bold / confident", "Poetic / aesthetic"];
                        const selected = captionSelectedIdx === i;
                        return (
                          <button key={i} onClick={() => handleSelectCaptionOption(i)}
                            className={`w-full text-left p-3 rounded-xl border transition-all ${selected ? "border-[hsl(263,70%,65%)] bg-[hsl(263,70%,65%)/10]" : `border-[hsl(220,13%,22%)] hover:border-[hsl(220,13%,35%)] bg-[hsl(220,14%,9%)]`}`}>
                            <div className="flex items-start gap-2.5">
                              <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selected ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)]" : "border-[hsl(220,13%,35%)]"}`}>
                                {selected && <span className="text-white text-[10px] font-bold">✓</span>}
                              </span>
                              <div>
                                <p className={`text-[10px] font-medium mb-1 ${selected ? "text-[hsl(263,70%,70%)]" : dimText}`}>{labels[i]}</p>
                                <p className={`text-sm leading-relaxed whitespace-pre-wrap ${selected ? "text-[hsl(220,10%,90%)]" : "text-[hsl(220,10%,70%)]"}`}>{opt}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <button onClick={() => setCaptionOptionsExpanded(true)}
                      className="w-full text-left p-3 rounded-xl border border-[hsl(220,13%,22%)] bg-[hsl(220,14%,9%)] hover:border-[hsl(220,13%,35%)] transition-colors">
                      {captionSelectedIdx !== null ? (
                        <p className={`text-sm leading-snug whitespace-pre-wrap text-[hsl(220,10%,75%)] line-clamp-2`}>{captionOptions[captionSelectedIdx]}</p>
                      ) : (
                        <p className={`text-sm ${dimText}`}>3 options ready — tap to choose</p>
                      )}
                      <p className={`text-[10px] mt-1 text-[hsl(263,70%,65%)]`}>{captionSelectedIdx !== null ? "Tap to change" : "Tap to view options"} ›</p>
                    </button>
                  )
                ) : !carouselCaption ? (
                  <button onClick={() => handleGetCaptionOptions("fresh")}
                    className="w-full py-3 rounded-xl border border-dashed border-[hsl(263,70%,65%)/40] text-[hsl(263,70%,70%)] hover:bg-[hsl(263,70%,65%)/10] text-sm font-medium transition-colors">
                    ✨ Generate 3 Caption Options
                  </button>
                ) : null}
              </div>
            )}

            {/* Schedule + Approve */}
            {carouselItems.length > 0 && (
              <div className={`${card} p-5 space-y-3`}>
                <span className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Schedule</span>
                <div className="flex gap-3 flex-wrap">
                  <div className="flex flex-col gap-0.5">
                    <label className={`text-[10px] ${dimText}`}>Date</label>
                    <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className={`text-[10px] ${dimText}`}>Time</label>
                    <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <button onClick={handleApproveCarousel}
                  disabled={!(isEditingCaption ? editingCaption : carouselCaption) || carouselItems.length < 2}
                  className="w-full py-3 rounded-xl font-semibold bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white disabled:opacity-40 disabled:cursor-not-allowed">
                  {editingPost && editingPost.status !== "draft" ? "✓ Update Post" : "✓ Approve & Schedule"}
                </button>
                <button onClick={handleSaveDraft}
                  disabled={carouselItems.length === 0}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}>
                  💾 Save as Draft
                </button>
              </div>
            )}

            </>)}
          </div>
        )}

        {/* ════ SINGLE POST ════ */}
        {screen === "single" && singlePostItem && (
          <div className="space-y-5">

            {/* Builder header — mirrors Carousel builder header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">New Single Post</h1>
                <p className={`${dimText} text-sm`}>{formatDay(todayStr())} · 1 image</p>
              </div>
              <button onClick={cancelSinglePost} className={mutedBtn}>Cancel</button>
            </div>

            {/* 1. MAIN VIEWER + BOTTOM ACTION BAR (same card as Carousel) */}
            <div className={`${card} overflow-hidden`}>
              {/* 4:5 viewer */}
              <div className="relative overflow-hidden rounded-t-xl" style={{ aspectRatio: "4/5" }}>
                {brokenImages.has(singlePostItem.id)
                  ? <div className="w-full h-full bg-[hsl(220,14%,9%)] flex items-center justify-center text-6xl">{tagIcon(singlePostItem.tag ?? "other")}</div>
                  : <img src={singlePostItem.dataUrl} alt="" className="w-full h-full object-cover" onError={() => setBrokenImages((p) => new Set([...p, singlePostItem!.id]))} />}
                {singlePostItem.tag && (
                  <span className={`absolute top-3 left-3 text-xs px-2 py-0.5 rounded-lg border backdrop-blur-sm ${tagColor(singlePostItem.tag, appSettings.customTags)}`}>
                    {tagIcon(singlePostItem.tag)} {tagLabel(singlePostItem.tag)}
                  </span>
                )}
                {/* ↻ New File pill + 1/1 counter — top right */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <button onClick={handleSingleNewMedia}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-black/60 text-white/80 hover:text-white backdrop-blur-sm hover:bg-black/75 transition-colors font-medium">
                    ↻ New File
                  </button>
                  <span className="text-xs px-2 py-0.5 rounded-lg bg-black/50 text-white backdrop-blur-sm">1 / 1</span>
                </div>
              </div>

              {/* Hidden file inputs (triggered programmatically from dropdown) */}
              <input ref={singleCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { if (e.target.files?.length) { handleFilesAdded(Array.from(e.target.files)); e.target.value = ""; } }} />
              <input ref={singleLibraryRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) { handleFilesAdded(Array.from(e.target.files)); e.target.value = ""; } }} />

              {/* Bottom bar — single "Choose File" button with dropdown */}
              <div className="relative border-t border-[hsl(220,13%,16%)]">
                {/* Dropdown — renders above the bar */}
                {singleChooseFileOpen && (
                  <>
                    {/* Backdrop to close on outside click */}
                    <div className="fixed inset-0 z-10" onClick={() => setSingleChooseFileOpen(false)} />
                    <div className={`absolute bottom-full left-0 right-0 mb-1 rounded-xl border ${border} bg-[hsl(220,14%,12%)] shadow-xl overflow-hidden z-20`}>
                      <button onClick={() => { setSingleChooseFileOpen(false); singleCameraRef.current?.click(); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[hsl(220,14%,18%)] transition-colors border-b ${border}`}>
                        <span>📷</span><span>Camera</span>
                      </button>
                      <button onClick={() => { setSingleChooseFileOpen(false); singleLibraryRef.current?.click(); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[hsl(220,14%,18%)] transition-colors border-b ${border}`}>
                        <span>📁</span><span>Camera Roll</span>
                      </button>
                      <button onClick={() => { setSingleChooseFileOpen(false); setSinglePickerOpen(true); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[hsl(220,14%,18%)] transition-colors">
                        <span>🖼</span><span>Media Pool</span>
                      </button>
                    </div>
                  </>
                )}
                <button onClick={() => setSingleChooseFileOpen((o) => !o)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 text-[hsl(220,10%,55%)] hover:text-white hover:bg-[hsl(220,14%,14%)] active:bg-[hsl(220,14%,18%)] transition-colors text-xs font-medium">
                  <span>📂</span><span>Choose File</span><span className={`text-[10px] transition-transform duration-150 ${singleChooseFileOpen ? "rotate-180" : ""}`}>▾</span>
                </button>
              </div>
            </div>

            {/* 3. CAPTION OPTIONS card — identical structure to Carousel */}
            <div className={`${card} p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => singleCaptionOptions && !singleGenerating && setSingleCaptionOptionsExpanded((v) => !v)}
                  className="flex items-center gap-2"
                  disabled={!singleCaptionOptions || singleGenerating}>
                  <span className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Caption Options</span>
                  {singleCaptionOptions && !singleGenerating && (
                    <span className={`text-[hsl(220,10%,45%)] text-xs transition-transform duration-200 ${singleCaptionOptionsExpanded ? "rotate-180" : "rotate-0"}`} style={{ display: "inline-block" }}>▾</span>
                  )}
                </button>
                {singleCaptionOptions && !singleGenerating && (
                  <button onClick={() => handleGenerateSingleCaption("fresh")}
                    className={`text-xs px-2.5 py-1 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}>
                    🆕 New
                  </button>
                )}
              </div>
              {/* User ideas */}
              <div>
                <label className={`block text-[10px] font-medium ${dimText} mb-1 uppercase tracking-wider`}>Your ideas (optional)</label>
                <textarea value={singleUserIdeas} onChange={(e) => setSingleUserIdeas(e.target.value)}
                  placeholder="e.g. summer vibes, mention the event, keep it chill…"
                  rows={2}
                  className={`w-full bg-[hsl(220,14%,9%)] border ${border} focus:border-[hsl(263,70%,65%)/60] rounded-xl px-3 py-2 text-xs text-[hsl(220,10%,80%)] resize-none focus:outline-none placeholder:text-[hsl(220,10%,35%)] transition-colors`} />
              </div>
              {singleError && (
                <div className="flex items-center justify-between gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <span>⚠️ {singleError}</span>
                  <button onClick={() => handleGenerateSingleCaption("fresh")} className="flex-shrink-0 px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium">↺ Try Again</button>
                </div>
              )}
              {singleGenerating ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <p className={`text-sm ${dimText} animate-pulse`}>✨ Generating 3 caption options…</p>
                </div>
              ) : singleCaptionOptions ? (
                singleCaptionOptionsExpanded ? (
                  <div className="space-y-2">
                    <p className={`text-xs ${dimText}`}>Tap a style to use it as your caption:</p>
                    {singleCaptionOptions.map((opt, i) => {
                      const labels = ["Minimal / cool", "Bold / confident", "Poetic / aesthetic"];
                      const selected = singleCaptionIdx === i;
                      return (
                        <button key={i} onClick={() => { setSingleCaptionIdx(i); setSingleCaption(opt); }}
                          className={`w-full text-left p-3 rounded-xl border transition-all ${selected ? "border-[hsl(263,70%,65%)] bg-[hsl(263,70%,65%)/10]" : "border-[hsl(220,13%,22%)] hover:border-[hsl(220,13%,35%)] bg-[hsl(220,14%,9%)]"}`}>
                          <div className="flex items-start gap-2.5">
                            <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selected ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)]" : "border-[hsl(220,13%,35%)]"}`}>
                              {selected && <span className="text-white text-[10px] font-bold">✓</span>}
                            </span>
                            <div>
                              <p className={`text-[10px] font-medium mb-1 ${selected ? "text-[hsl(263,70%,70%)]" : dimText}`}>{labels[i]}</p>
                              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${selected ? "text-[hsl(220,10%,90%)]" : "text-[hsl(220,10%,70%)]"}`}>{opt}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <button onClick={() => setSingleCaptionOptionsExpanded(true)}
                    className="w-full text-left p-3 rounded-xl border border-[hsl(220,13%,22%)] bg-[hsl(220,14%,9%)] hover:border-[hsl(220,13%,35%)] transition-colors">
                    {singleCaptionIdx !== null ? (
                      <p className="text-sm leading-snug whitespace-pre-wrap text-[hsl(220,10%,75%)] line-clamp-2">{singleCaptionOptions[singleCaptionIdx]}</p>
                    ) : (
                      <p className={`text-sm ${dimText}`}>3 options ready — tap to choose</p>
                    )}
                    <p className="text-[10px] mt-1 text-[hsl(263,70%,65%)]">{singleCaptionIdx !== null ? "Tap to change" : "Tap to view options"} ›</p>
                  </button>
                )
              ) : !singleCaption ? (
                <button onClick={() => handleGenerateSingleCaption("fresh")}
                  className="w-full py-3 rounded-xl border border-dashed border-[hsl(263,70%,65%)/40] text-[hsl(263,70%,70%)] hover:bg-[hsl(263,70%,65%)/10] text-sm font-medium transition-colors">
                  ✨ Generate 3 Caption Options
                </button>
              ) : null}
            </div>

            {/* 4. SELECTED CAPTION DISPLAY */}
            {singleCaption && !singleEditing && (
              <div className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-[hsl(220,10%,85%)] leading-relaxed whitespace-pre-wrap flex-1">{singleCaption}</p>
                  <button onClick={() => { setSingleEditText(singleCaption); setSingleEditing(true); }}
                    className={`text-xs px-2 py-1 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] flex-shrink-0`}>✏️</button>
                </div>
                <div className="flex gap-2 mt-2.5 flex-wrap">
                  <button onClick={() => handleGenerateSingleCaption("variations")} disabled={singleGenerating}
                    className="text-xs px-2.5 py-1 rounded-lg bg-[hsl(263,70%,65%)/15] text-[hsl(263,70%,70%)] border border-[hsl(263,70%,65%)/25] hover:bg-[hsl(263,70%,65%)/25] disabled:opacity-40">
                    {singleGenerating ? "…" : "↺ Variations"}
                  </button>
                  <button onClick={() => handleGenerateSingleCaption("fresh")} disabled={singleGenerating}
                    className={`text-xs px-2.5 py-1 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] disabled:opacity-40`}>
                    🆕 New Caption
                  </button>
                </div>
              </div>
            )}

            {/* Caption edit mode */}
            {singleEditing && (
              <div className={`${card} p-4 space-y-2`}>
                <p className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Edit Caption</p>
                <textarea value={singleEditText} onChange={(e) => setSingleEditText(e.target.value)} rows={4} autoFocus
                  className="w-full bg-[hsl(220,14%,9%)] border border-[hsl(263,70%,65%)/40] rounded-xl p-3 text-sm text-[hsl(220,10%,85%)] resize-none focus:outline-none focus:border-[hsl(263,70%,65%)/70]" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setSingleEditing(false)} className={mutedBtn}>Cancel</button>
                  <button onClick={() => { setSingleCaption(singleEditText); setSingleEditing(false); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(263,70%,65%)] text-white">Save</button>
                </div>
              </div>
            )}

            {/* 5. SCHEDULE + APPROVE — mirrors Carousel */}
            <div className={`${card} p-5 space-y-3`}>
              <span className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Schedule</span>
              <div className="flex gap-3 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <label className={`text-[10px] ${dimText}`}>Date</label>
                  <input type="date" value={singleScheduleDate} onChange={(e) => setSingleScheduleDate(e.target.value)} className={inputCls} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className={`text-[10px] ${dimText}`}>Time</label>
                  <input type="time" value={singleScheduleTime} onChange={(e) => setSingleScheduleTime(e.target.value)} className={inputCls} />
                </div>
              </div>
              <button onClick={handleApproveSinglePost}
                disabled={!(singleEditing ? singleEditText : singleCaption)}
                className="w-full py-3 rounded-xl font-semibold bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white disabled:opacity-40 disabled:cursor-not-allowed">
                ✓ Approve & Schedule
              </button>
              <button
                onClick={async () => {
                  if (!singlePostItem) return;
                  const draft = {
                    id: generateId(), type: "single" as const,
                    mediaIds: [singlePostItem.id],
                    caption: singleEditing ? singleEditText : (singleCaption || ""),
                    scheduleDate: singleScheduleDate, scheduleTime: singleScheduleTime,
                    createdAt: new Date().toISOString(),
                  };
                  setDrafts((prev) => [draft, ...prev]);
                  try { await apiPost("/drafts", draft); } catch {}
                  cancelSinglePost();
                  goToScreen("drafts");
                }}
                className={`w-full py-2.5 rounded-xl text-sm font-medium border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] transition-colors`}>
                💾 Save as Draft
              </button>
            </div>

          </div>
        )}

        {/* ════ CALENDAR ════ */}
        {screen === "calendar" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Calendar</h1>
                <p className={`${dimText} text-sm`}>{scheduledPosts.length} post{scheduledPosts.length !== 1 ? "s" : ""}{draftPosts.length > 0 ? ` · ${draftPosts.length} draft${draftPosts.length !== 1 ? "s" : ""}` : ""}</p>
              </div>
              <div className="flex gap-1">
                {(["list", "week", "month"] as const).map((v) => (
                  <button key={v} onClick={() => setCalendarView(v)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${calendarView === v ? activeNavCls : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                    {v === "list" ? "☰ List" : v === "week" ? "📆 Week" : "📅 Month"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Scheduled</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Posted</span>
            </div>

            {/* ── DRAFTS SECTION ── */}
            {draftPosts.length > 0 && (
              <div className={`${card} p-4 space-y-3`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-amber-400">💾 Drafts</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400`}>{draftPosts.length}</span>
                </div>
                <div className="space-y-2">
                  {draftPosts.map((draft) => {
                    const previewMedia = (draft.mediaIds ?? []).slice(0, 4).map((id) => mediaMap[id]).filter(Boolean) as MediaItem[];
                    return (
                      <div key={draft.id} className={`flex items-center gap-3 p-3 rounded-xl border border-amber-400/20 bg-amber-400/5`}>
                        {/* Thumbnails */}
                        <div className="flex gap-1 flex-shrink-0">
                          {previewMedia.slice(0, 2).map((m) => (
                            <div key={m.id} className="w-10 h-10 rounded-lg overflow-hidden">
                              {isVideo(m.dataUrl) ? <div className="w-full h-full bg-[hsl(220,14%,20%)] flex items-center justify-center text-xs">▶</div> : <img src={m.dataUrl} alt="" className="w-full h-full object-cover" />}
                            </div>
                          ))}
                          {previewMedia.length === 0 && <div className="w-10 h-10 rounded-lg bg-[hsl(220,14%,20%)] flex items-center justify-center text-lg">💾</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs ${dimText} line-clamp-1`}>{draft.caption || "No caption"}</p>
                          <p className={`text-[10px] text-amber-400/70 mt-0.5`}>{draft.slideCount} slide{draft.slideCount !== 1 ? "s" : ""} · {draft.tagsSummary || "—"}</p>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          {draft.mediaIds?.length ? (
                            <button onClick={() => openPostForEdit(draft)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-[hsl(263,70%,65%)/20] text-[hsl(263,70%,75%)] border border-[hsl(263,70%,65%)/30] hover:bg-[hsl(263,70%,65%)/30]">
                              ✏️ Edit
                            </button>
                          ) : null}
                          <button onClick={() => { setApprovedPosts((prev) => prev.filter((p) => p.id !== draft.id)); apiDelete(`/posts/${draft.id}`).catch(() => {}); }}
                            className="text-xs px-2.5 py-1 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10">
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {scheduledPosts.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <span className="text-4xl">📅</span>
                <p className={`${dimText} text-sm`}>No posts scheduled yet.</p>
              </div>
            ) : calendarView === "week" ? (
              /* Week view */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <button onClick={() => setCalendarWeekStart((ws) => { const d = new Date(ws + "T12:00:00"); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0]; })} className={`${mutedBtn} px-3`}>‹</button>
                  <span className={`text-sm font-semibold ${dimText}`}>
                    CW {getISOWeek(new Date(calendarWeekStart + "T12:00:00"))}
                  </span>
                  <button onClick={() => setCalendarWeekStart((ws) => { const d = new Date(ws + "T12:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })} className={`${mutedBtn} px-3`}>›</button>
                </div>
                <div className="space-y-2">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                    const d = new Date(calendarWeekStart + "T12:00:00");
                    d.setDate(d.getDate() + i);
                    const dk = d.toISOString().split("T")[0];
                    const dayPosts = postsByDate[dk] ?? [];
                    const isToday = dk === todayStr();
                    return (
                      <div key={dk} className={`rounded-xl border ${isToday ? "border-[hsl(263,70%,65%)/40] bg-[hsl(263,70%,65%)/5]" : border} p-3`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold ${isToday ? "text-[hsl(263,70%,75%)]" : dimText}`}>
                              {WEEK_DAY_SHORT[i]}
                            </span>
                            <span className={`text-xs ${isToday ? "text-[hsl(263,70%,75%)]" : dimText}`}>
                              {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                            {isToday && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[hsl(263,70%,65%)/20] text-[hsl(263,70%,75%)]">Today</span>}
                          </div>
                          {dayPosts.length > 0 && <span className={`text-[10px] ${dimText}`}>{dayPosts.length} post{dayPosts.length !== 1 ? "s" : ""}</span>}
                        </div>
                        {dayPosts.length === 0 ? (
                          <p className={`text-[10px] ${dimText} italic`}>No posts</p>
                        ) : (
                          <div className="space-y-1.5">
                            {dayPosts.map((post) => {
                              const sc = postStatusClasses(post);
                              return (
                                <div key={post.id} className={`flex items-center gap-2 py-1 border-t ${border}`}>
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                                  <p className={`text-xs ${dimText} truncate flex-1`}>{post.caption || `${post.slideCount} slides`}</p>
                                  {post.scheduledTime && <span className="text-[10px] text-[hsl(220,10%,40%)]">{post.scheduledTime}</span>}
                                  <div className="flex gap-2 flex-shrink-0">
                                    {post.mediaIds?.length ? <button onClick={() => { setPreviewPost(post); setPreviewSlide(0); }} className={`text-[10px] ${dimText} hover:text-white`}>👁</button> : null}
                                    {post.mediaIds?.length ? <button onClick={() => openPostForEdit(post)} className={`text-[10px] ${dimText} hover:text-[hsl(263,70%,70%)]`}>✏️</button> : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : calendarView === "list" ? (
              <div className="space-y-5">
                {calendarListGroups.map((mg) => (
                  <div key={mg.ym}>
                    <p className="text-sm font-semibold mb-3">{mg.label}</p>
                    {mg.weeks.map((wg) => (
                      <div key={wg.week} className="mb-4">
                        <p className={`text-xs ${dimText} mb-2 font-medium`}>CW {wg.week}</p>
                        <div className="space-y-2 pl-2">
                          {wg.posts.map((post) => {
                            const sc = postStatusClasses(post);
                            return (
                              <div key={post.id} className={`${card} border ${sc.card} p-3 space-y-2`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                                    <span className={`text-xs ${dimText}`}>{post.slideCount} slide{post.slideCount !== 1 ? "s" : ""}</span>
                                    {post.tagsSummary && <span className="text-sm leading-none">{post.tagsSummary}</span>}
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className={`text-xs ${dimText}`}>{formatDayShort(post.scheduledDate ?? post.day)}</div>
                                    {post.scheduledTime && <div className="text-[10px] text-[hsl(220,10%,40%)]">🕐 {post.scheduledTime}</div>}
                                  </div>
                                </div>
                                {post.caption && <p className="text-sm text-[hsl(220,10%,75%)] leading-relaxed line-clamp-2">{post.caption}</p>}
                                <div className="flex items-center justify-between pt-0.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full border ${sc.badge}`}>
                                    {getPostStatus(post) === "scheduled" ? "🕐 Scheduled" : "✓ Posted"}
                                  </span>
                                  <div className="flex gap-3 items-center">
                                    {post.mediaIds?.length ? <button onClick={() => { setPreviewPost(post); setPreviewSlide(0); }} className={`text-xs ${dimText} hover:text-white`}>👁 Preview</button> : null}
                                    {post.mediaIds?.length ? <button onClick={() => openPostForEdit(post)} className={`text-xs ${dimText} hover:text-[hsl(263,70%,70%)]`}>✏️ Edit</button> : null}
                                    <button onClick={() => setDeleteConfirmPost(post)} className={`text-xs ${dimText} hover:text-red-400`}>Delete</button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              /* Month view */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <button onClick={() => setCalendarMonth((m) => { const d = new Date(m.year, m.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} className={`${mutedBtn} px-3`}>‹</button>
                  <span className="text-sm font-semibold">{MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}</span>
                  <button onClick={() => setCalendarMonth((m) => { const d = new Date(m.year, m.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} className={`${mutedBtn} px-3`}>›</button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {WEEK_DAY_SHORT.map((d) => <div key={d} className={`text-center text-[10px] ${dimText} py-1 font-medium`}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {getCalendarGrid(calendarMonth.year, calendarMonth.month).map((day, idx) => {
                    if (!day) return <div key={`pad-${idx}`} />;
                    const dk = dayKey(calendarMonth.year, calendarMonth.month, day);
                    const dayPosts = postsByDate[dk] ?? [];
                    const isToday = dk === todayStr();
                    const isSelected = calendarDaySelected === dk;
                    return (
                      <button key={dk} onClick={() => setCalendarDaySelected(isSelected ? null : dk)}
                        className={`rounded-lg py-1.5 flex flex-col items-center gap-1 transition-colors min-h-[48px] ${isSelected ? "bg-[hsl(263,70%,65%)/20] border border-[hsl(263,70%,65%)/40]" : isToday ? `border ${border} bg-[hsl(220,14%,14%)]` : "hover:bg-[hsl(220,14%,14%)]"}`}>
                        <span className={`text-xs font-medium ${isToday ? "text-[hsl(263,70%,75%)]" : dimText}`}>{day}</span>
                        <div className="flex flex-wrap gap-0.5 justify-center max-w-[32px]">
                          {dayPosts.slice(0, 3).map((p, pi) => <span key={pi} className={`w-1.5 h-1.5 rounded-full ${postStatusClasses(p).dot}`} />)}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {calendarDaySelected && (() => {
                  const dayPosts = postsByDate[calendarDaySelected] ?? [];
                  if (!dayPosts.length) return <p className={`text-center py-3 text-xs ${dimText}`}>No posts on {formatDayShort(calendarDaySelected)}.</p>;
                  return (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-medium text-[hsl(220,10%,60%)]">{formatDayShort(calendarDaySelected)}</p>
                      {dayPosts.map((post) => {
                        const sc = postStatusClasses(post);
                        const allThumbs = (post.mediaIds ?? []).slice(0, 3).map((id) => mediaMap[id]).filter(Boolean) as MediaItem[];
                        return (
                          <div key={post.id} className={`${card} border ${sc.card} overflow-hidden`}>
                            <div className="flex items-stretch">
                              {allThumbs.length > 0 && (
                                <div className="w-14 flex-shrink-0 overflow-hidden">
                                  {isVideo(allThumbs[0].dataUrl) ? <video src={allThumbs[0].dataUrl} className="w-full h-full object-cover" /> : <img src={allThumbs[0].dataUrl} alt="" className="w-full h-full object-cover" />}
                                </div>
                              )}
                              <div className="flex-1 p-3 space-y-1.5 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${sc.dot}`} /><span className={`text-xs ${dimText}`}>{post.slideCount} slides</span></div>
                                  {post.scheduledTime && <span className={`text-xs ${dimText}`}>🕐 {post.scheduledTime}</span>}
                                </div>
                                {post.caption && <p className={`text-xs ${dimText} line-clamp-2`}>{post.caption}</p>}
                                <div className="flex gap-3 justify-end">
                                  {post.mediaIds?.length ? <button onClick={() => { setPreviewPost(post); setPreviewSlide(0); }} className={`text-xs ${dimText} hover:text-white`}>👁 Preview</button> : null}
                                  {post.mediaIds?.length ? <button onClick={() => openPostForEdit(post)} className={`text-xs ${dimText} hover:text-[hsl(263,70%,70%)]`}>✏️ Edit</button> : null}
                                  <button onClick={() => setDeleteConfirmPost(post)} className={`text-xs ${dimText} hover:text-red-400`}>Delete</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ════ SETTINGS ════ */}
        {screen === "settings" && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold">Settings</h1>
              <p className={`${dimText} text-sm`}>Configure your workflow preferences.</p>
            </div>

            {/* Instagram profile */}
            <div className={`${card} p-5 space-y-3`}>
              <p className="text-sm font-semibold">📸 Instagram Profile</p>
              <div>
                <p className={`text-xs ${dimText} mb-1.5`}>Your Instagram username (used in post previews)</p>
                <input value={appSettings.instagramUsername}
                  onChange={(e) => setAppSettings((s) => ({ ...s, instagramUsername: e.target.value.replace(/[^a-zA-Z0-9._]/g, "").toLowerCase() }))}
                  placeholder="yourhandle"
                  className={`w-full ${inputCls}`} />
              </div>
            </div>

            {/* Timing */}
            <div className={`${card} p-5 space-y-4`}>
              <p className="text-sm font-semibold">⏰ Timing</p>
              <div>
                <p className={`text-xs ${dimText} mb-1.5`}>Daily carousel reminder <span className="text-[hsl(220,10%,35%)]">(default {DEFAULT_NOTIFICATION_TIME})</span></p>
                <div className="flex gap-2 items-center">
                  <input type="time" value={appSettings.notificationTime} onChange={(e) => setAppSettings((s) => ({ ...s, notificationTime: e.target.value }))} className={inputCls} />
                  <button onClick={resetNotificationTime} className={`text-xs px-3 py-2 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] hover:text-white transition-colors`}>↺ Reset</button>
                </div>
              </div>
            </div>

            {/* Caption Style */}
            <div className={`${card} p-5 space-y-4`}>
              <p className="text-sm font-semibold">✍️ Caption Style</p>

              {/* Caption Prompt */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={`text-xs font-medium ${dimText}`}>Caption Prompt</label>
                  <button onClick={() => setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, captionPrompt: DEFAULT_CAPTION_PROMPT } }))}
                    className={`text-[10px] px-2 py-1 rounded border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}>↺ Reset</button>
                </div>
                <textarea
                  rows={5}
                  value={appSettings.captionSettings.captionPrompt ?? DEFAULT_CAPTION_PROMPT}
                  onChange={(e) => setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, captionPrompt: e.target.value } }))}
                  className={`w-full ${inputCls} resize-none text-xs leading-relaxed`}
                />
                <p className={`text-[10px] ${dimText} mt-1`}>This is the base instruction sent to the AI for every caption.</p>
              </div>

              <div>
                <p className={`text-xs ${dimText} mb-1.5`}>Tone</p>
                <input value={appSettings.captionSettings.tone}
                  onChange={(e) => setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, tone: e.target.value } }))}
                  placeholder="e.g. cool, modern, lowercase" className={`w-full ${inputCls} mb-2`} />
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_TONES.map((t) => {
                    const active = appSettings.captionSettings.tone.includes(t);
                    return <button key={t}
                      onClick={() => setAppSettings((s) => { const tones = s.captionSettings.tone.split(",").map((x) => x.trim()).filter(Boolean); const next = tones.includes(t) ? tones.filter((x) => x !== t) : [...tones, t]; return { ...s, captionSettings: { ...s.captionSettings, tone: next.join(", ") } }; })}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${active ? activeNavCls : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>{t}</button>;
                  })}
                </div>
              </div>
              <div>
                <p className={`text-xs ${dimText} mb-1.5`}>Preferred hashtags</p>
                <div className="flex gap-2 mb-2">
                  <input value={newHashtagInput} onChange={(e) => setNewHashtagInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    onKeyDown={(e) => { if (e.key === "Enter") { const v = newHashtagInput.trim(); if (v && !appSettings.captionSettings.hashtags.includes(v)) { setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: [...s.captionSettings.hashtags, v] } })); setNewHashtagInput(""); } } }}
                    placeholder="Add hashtag…" className={`flex-1 ${inputCls}`} />
                  <button onClick={() => { const v = newHashtagInput.trim(); if (v && !appSettings.captionSettings.hashtags.includes(v)) { setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: [...s.captionSettings.hashtags, v] } })); setNewHashtagInput(""); } }}
                    className="text-xs px-3 py-2 rounded-lg bg-[hsl(263,70%,65%)] text-white">Add</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {SUGGESTED_HASHTAGS.filter((h) => !appSettings.captionSettings.hashtags.includes(h)).slice(0, 6).map((h) => (
                    <button key={h} onClick={() => setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: [...s.captionSettings.hashtags, h] } }))}
                      className={`text-xs px-2 py-1 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}>+ #{h}</button>
                  ))}
                </div>
                {appSettings.captionSettings.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {appSettings.captionSettings.hashtags.map((h) => (
                      <span key={h} className="text-xs px-2 py-1 rounded-lg bg-[hsl(263,70%,65%)/15] text-[hsl(263,70%,70%)] border border-[hsl(263,70%,65%)/25] flex items-center gap-1">
                        #{h}
                        <button onClick={() => setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: s.captionSettings.hashtags.filter((x) => x !== h) } }))}
                          className="text-[hsl(263,70%,50%)] hover:text-red-400 text-[10px]">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className={`text-xs ${dimText} mb-1.5`}>Additional instructions <span className="text-[hsl(220,10%,35%)]">(appended to every prompt)</span></p>
                <textarea
                  rows={2}
                  value={appSettings.captionSettings.customInstructions ?? ""}
                  onChange={(e) => setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, customInstructions: e.target.value } }))}
                  placeholder="e.g. Always mention the city. Avoid the word 'journey'."
                  className={`w-full ${inputCls} resize-none`}
                />
              </div>
            </div>

            {/* Manage Tags */}
            <div className={`${card} p-5 space-y-4`}>
              <p className="text-sm font-semibold">🏷️ Manage Tags</p>
              <div>
                <p className={`text-xs ${dimText} mb-1.5`}>Add custom tag — type a word and pick an emoji</p>
                {/* Emoji preview row */}
                {newTagInput.trim() && (
                  <div className="mb-2 p-2.5 rounded-xl border border-[hsl(263,70%,65%)/25] bg-[hsl(263,70%,65%)/8] flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-[hsl(220,10%,85%)]">
                      <span className="text-xl mr-1">{tagInputEmoji}</span>
                      {newTagInput.trim().charAt(0).toUpperCase() + newTagInput.trim().slice(1)}
                    </span>
                    <div className="flex gap-1 flex-wrap">
                      {ALT_EMOJIS.slice(0, 10).map((em) => (
                        <button key={em} onClick={() => setTagInputEmoji(em)}
                          className={`text-base px-1.5 py-0.5 rounded-lg transition-colors ${tagInputEmoji === em ? "bg-[hsl(263,70%,65%)/30] ring-1 ring-[hsl(263,70%,65%)]" : "hover:bg-[hsl(220,14%,18%)]"}`}>
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <input value={newTagInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewTagInput(val);
                      const suggested = suggestEmoji(val);
                      setTagInputEmoji(suggested);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") addCustomTag(); }}
                    placeholder="e.g. Beach, Gym, Party…" className={`flex-1 ${inputCls}`} />
                  <button onClick={addCustomTag} disabled={!newTagInput.trim()}
                    className="text-xs px-3 py-2 rounded-lg bg-[hsl(263,70%,65%)] text-white disabled:opacity-40">Add</button>
                </div>
                {newTagInput.trim() && (
                  <p className={`text-[10px] ${dimText} mt-1`}>Will be saved as: <span className="text-[hsl(220,10%,70%)]">{tagInputEmoji} {newTagInput.trim().charAt(0).toUpperCase() + newTagInput.trim().slice(1)}</span></p>
                )}
              </div>
              <div>
                <p className={`text-xs ${dimText} mb-1.5`}>Active tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {allAvailableTags.map((tag) => (
                    <span key={tag} className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${tagColor(tag, appSettings.customTags)}`}>
                      {tagIcon(tag)} {tagLabel(tag)}
                      <button onClick={() => BASE_TAGS.includes(tag) ? setAppSettings((s) => ({ ...s, hiddenBaseTags: [...s.hiddenBaseTags, tag] })) : setAppSettings((s) => ({ ...s, customTags: s.customTags.filter((t) => t !== tag) }))}
                        className="opacity-60 hover:opacity-100 hover:text-red-400 text-[10px]">✕</button>
                    </span>
                  ))}
                </div>
              </div>
              {appSettings.hiddenBaseTags.length > 0 && (
                <div>
                  <p className={`text-xs ${dimText} mb-1.5`}>Hidden tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {appSettings.hiddenBaseTags.map((tag) => (
                      <button key={tag} onClick={() => setAppSettings((s) => ({ ...s, hiddenBaseTags: s.hiddenBaseTags.filter((t) => t !== tag) }))}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border ${border} ${dimText} opacity-50 hover:opacity-100 hover:bg-[hsl(220,14%,16%)]`}>
                        {tagIcon(tag)} {tagLabel(tag)} ↺
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Carousel Preferences */}
            <div className={`${card} p-5 space-y-5`}>
              <div>
                <p className="text-sm font-semibold">🎠 Carousel Preferences</p>
                <p className={`text-xs ${dimText} mt-0.5`}>Control how the AI generates and orders carousel slides.</p>
              </div>

              {/* Carousel Size */}
              <div>
                <p className={`text-xs font-medium ${dimText} mb-2`}>Slide count</p>
                <div className="flex gap-2 flex-wrap">
                  {(["random", 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20] as const).map((opt) => {
                    const val: number | "random" = opt;
                    const active = appSettings.carouselSize === val;
                    return (
                      <button key={String(opt)}
                        onClick={() => setAppSettings((s) => ({ ...s, carouselSize: val }))}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors font-medium
                          ${active ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)] text-white" : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                        {opt === "random" ? "🎲 Random" : String(opt)}
                      </button>
                    );
                  })}
                </div>
                {appSettings.carouselSize === "random" && (
                  <p className={`text-[10px] ${dimText} mt-1`}>AI picks 2–12 slides based on available media.</p>
                )}
              </div>

              {/* Slide Order Rules */}
              <div>
                <p className={`text-xs font-medium ${dimText} mb-2`}>Slide order</p>
                <div className="space-y-2">
                  {([
                    { rule: "tag-sequence" as const, icon: "🔢", label: "Follow tag sequence", desc: "Define the exact order by tag" },
                    { rule: "ai-free" as const, icon: "🤖", label: "AI chooses freely", desc: "AI picks the best order" },
                  ]).map(({ rule, icon, label, desc }) => {
                    const active = appSettings.slideOrderRule === rule;
                    return (
                      <button key={rule} onClick={() => setAppSettings((s) => ({ ...s, slideOrderRule: rule }))}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all
                          ${active ? "border-[hsl(263,70%,65%)/60] bg-[hsl(263,70%,65%)/10]" : `${border} hover:bg-[hsl(220,14%,15%)]`}`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)]" : "border-[hsl(220,13%,35%)]"}`}>
                          {active && <span className="text-white text-[8px] font-bold">✓</span>}
                        </div>
                        <span className="text-sm">{icon}</span>
                        <div>
                          <p className={`text-xs font-medium ${active ? "text-[hsl(220,10%,90%)]" : "text-[hsl(220,10%,70%)]"}`}>{label}</p>
                          <p className={`text-[10px] ${dimText}`}>{desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* Tag sequence editor */}
                {appSettings.slideOrderRule === "tag-sequence" && (
                  <div className="mt-3 p-3 rounded-xl border border-[hsl(263,70%,65%)/20] bg-[hsl(263,70%,65%)/5] space-y-2">
                    <p className={`text-[10px] font-medium ${dimText}`}>Drag tags to define order (first = first slide):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allAvailableTags.map((tag) => {
                        const idx = appSettings.tagSequence.indexOf(tag);
                        const inSeq = idx !== -1;
                        return (
                          <button key={tag}
                            onClick={() => setAppSettings((s) => ({
                              ...s,
                              tagSequence: inSeq
                                ? s.tagSequence.filter((t) => t !== tag)
                                : [...s.tagSequence, tag]
                            }))}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-all
                              ${inSeq ? tagColor(tag, appSettings.customTags) + " ring-1 ring-inset ring-current" : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                            {inSeq && <span className="text-[9px] font-bold opacity-70">{idx + 1}.</span>}
                            {tagIcon(tag)} {tagLabel(tag)}
                          </button>
                        );
                      })}
                    </div>
                    {appSettings.tagSequence.length > 0 && (
                      <div className="flex items-center gap-2">
                        <p className={`text-[10px] ${dimText} flex-1`}>Sequence: {appSettings.tagSequence.map((t) => `${tagIcon(t)} ${tagLabel(t)}`).join(" → ")}</p>
                        <button onClick={() => setAppSettings((s) => ({ ...s, tagSequence: [] }))} className={`text-[10px] ${dimText} hover:text-red-400`}>Clear</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Preferred tags */}
              <div>
                <p className={`text-xs font-medium ${dimText} mb-2`}>Preferred content tags <span className="font-normal text-[hsl(220,10%,35%)]">— AI prioritizes these</span></p>
                <div className="flex flex-wrap gap-2">
                  {allAvailableTags.map((tag) => {
                    const active = appSettings.preferredTags.includes(tag);
                    return <button key={tag}
                      onClick={() => setAppSettings((s) => ({ ...s, preferredTags: active ? s.preferredTags.filter((t) => t !== tag) : [...s.preferredTags, tag] }))}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${active ? tagColor(tag, appSettings.customTags) : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                      {tagIcon(tag)} {tagLabel(tag)}
                    </button>;
                  })}
                </div>
              </div>

              {/* Custom AI instructions */}
              <div>
                <p className={`text-xs font-medium ${dimText} mb-1.5`}>Custom AI instructions <span className="font-normal text-[hsl(220,10%,35%)]">(optional)</span></p>
                <textarea
                  value={appSettings.aiCustomPreferences}
                  onChange={(e) => setAppSettings((s) => ({ ...s, aiCustomPreferences: e.target.value }))}
                  rows={2}
                  placeholder="e.g. always include a DJ photo, prefer night shots on weekends"
                  className={`w-full bg-[hsl(220,14%,9%)] border ${border} rounded-xl p-3 text-sm text-[hsl(220,10%,85%)] placeholder:text-[hsl(220,10%,30%)] resize-none focus:outline-none focus:border-[hsl(263,70%,65%)/50]`}
                />
              </div>
            </div>

            <div className="space-y-2">
              {settingsSaved && (
                <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                  <span className="text-emerald-400 text-sm font-semibold">✓ Settings saved!</span>
                </div>
              )}
              <button onClick={handleSaveSettings} disabled={settingsSaving}
                className={`w-full py-3 rounded-xl text-white text-sm font-semibold transition-all ${settingsSaved ? "bg-emerald-500" : "bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)]"} disabled:opacity-60`}>
                {settingsSaving ? "Saving…" : settingsSaved ? "✓ Saved!" : "Save Settings"}
              </button>
              <p className={`text-xs ${dimText} text-center`}>{mediaItems.length} items in pool · {approvedPosts.length} posts</p>
            </div>
          </div>
        )}
      </main>

      {/* ── SELECTION BAR ── */}
      {selectionMode && (
        <div className={`fixed bottom-0 left-0 right-0 z-30 bg-[hsl(220,14%,10%)] border-t ${border} px-4 py-4 flex items-center justify-between`}>
          <button onClick={cancelSelection} className={`text-sm ${dimText} hover:text-white`}>Cancel</button>
          <span className={`text-sm ${dimText}`}>
            {selectionMode === "carousel" ? (selectedIds.length < 2 ? `Select ${2 - selectedIds.length} more` : `${selectedIds.length} selected`) : (selectedIds.length === 0 ? "Tap an image" : "1 selected")}
          </span>
          {selectionMode === "carousel"
            ? <button onClick={handleBuildCarouselFromSelection} disabled={selectedIds.length < 2} className="px-4 py-2 rounded-xl bg-[hsl(263,70%,65%)] text-white text-sm font-semibold disabled:opacity-40">Build →</button>
            : <button onClick={handleStartSinglePost} disabled={selectedIds.length === 0} className="px-4 py-2 rounded-xl bg-[hsl(263,70%,65%)] text-white text-sm font-semibold disabled:opacity-40">Continue →</button>}
        </div>
      )}

      {/* ── BULK ACTION TOOLBAR ── */}
      {bulkMode && (
        <div className={`fixed bottom-0 left-0 right-0 z-30 bg-[hsl(220,14%,10%)] border-t ${border} px-4 pt-3 pb-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <button onClick={cancelBulkMode}
              className="text-sm font-medium text-white bg-[hsl(220,14%,20%)] hover:bg-[hsl(220,14%,26%)] px-3 py-1.5 rounded-lg border border-[hsl(220,13%,28%)] transition-colors">
              ← Back
            </button>
            <span className={`text-sm font-medium ${bulkSelectedIds.length === 0 ? dimText : "text-white"}`}>
              {bulkSelectedIds.length === 0 ? "Select items" : `${bulkSelectedIds.length} selected`}
            </span>
            <button onClick={() => {
              const poolItems = openFolder ? mediaItems.filter((m) => openFolder.mediaIds.includes(m.id)) : filteredSortedMedia;
              setBulkSelectedIds(poolItems.map((m) => m.id));
            }} className={`text-xs ${dimText} hover:text-white`}>Select All</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { if (bulkSelectedIds.length > 0) setFolderPickerOpen(true); }}
              disabled={bulkSelectedIds.length === 0}
              className={`py-2.5 rounded-xl border ${border} text-xs font-medium flex flex-col items-center gap-1 ${dimText} hover:bg-[hsl(220,14%,18%)] disabled:opacity-40 transition-colors`}>
              <span className="text-base">📁</span>Add to Folder
            </button>
            <button onClick={handleBulkCreatePost} disabled={bulkSelectedIds.length === 0}
              className={`py-2.5 rounded-xl bg-[hsl(263,70%,65%)/15] border border-[hsl(263,70%,65%)/30] text-xs font-medium flex flex-col items-center gap-1 text-[hsl(263,70%,75%)] hover:bg-[hsl(263,70%,65%)/25] disabled:opacity-40 transition-colors`}>
              <span className="text-base">📸</span>
              {bulkSelectedIds.length === 1 ? "Single Post" : bulkSelectedIds.length >= 2 ? "Carousel" : "Create Post"}
            </button>
            <button onClick={handleBulkDelete} disabled={bulkSelectedIds.length === 0}
              className="py-2.5 rounded-xl border border-red-500/20 text-xs font-medium flex flex-col items-center gap-1 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors">
              <span className="text-base">🗑</span>Delete
            </button>
          </div>
        </div>
      )}

      {/* ── FULLSCREEN VIEWER — iOS Photos style ── */}
      {viewerItem && (() => {
        const isFav = viewerFavorites.has(viewerItem.id);
        const dateStr = viewerItem.createdAt
          ? new Date(viewerItem.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
          : "";
        const timeStr = viewerItem.createdAt
          ? new Date(viewerItem.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
          : "";
        return (
          <div className="fixed inset-0 z-40 flex flex-col bg-black" style={{ userSelect: "none" }}>
            {/* iOS-style top bar */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 pt-12 pb-3 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
              <div>
                {dateStr && <p className="text-white text-sm font-semibold leading-tight">{dateStr}</p>}
                {timeStr && <p className="text-white/60 text-xs">{timeStr}</p>}
              </div>
              <button onClick={() => setViewerItem(null)}
                className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white text-lg leading-none">
                ✕
              </button>
            </div>

            {/* Media area — tap background to close */}
            <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={() => setViewerItem(null)}>
              {isVideo(viewerItem.dataUrl) ? (
                <video
                  ref={(el) => { (viewerVideoRef as any).current = el; }}
                  src={viewerItem.dataUrl}
                  className="max-w-full max-h-full object-contain"
                  controls
                  playsInline
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <img
                  src={viewerItem.dataUrl}
                  alt={viewerItem.name}
                  className="max-w-full max-h-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>

            {/* iOS-style bottom action bar */}
            <div className="flex-shrink-0 bg-black/80 backdrop-blur-md border-t border-white/10 pb-8 pt-3 px-4">
              {/* Tag row */}
              {viewerItem.tag && (
                <div className="flex justify-center mb-3">
                  <button onClick={() => { const item = viewerItem; setTagPickerReturnItem(item); setViewerItem(null); setTagPickerItem(item); }}
                    className={`text-xs px-3 py-1.5 rounded-full border backdrop-blur-sm ${tagColor(viewerItem.tag, appSettings.customTags)}`}>
                    {tagIcon(viewerItem.tag)} {tagLabel(viewerItem.tag)} · tap to change
                  </button>
                </div>
              )}
              {/* Action icons */}
              <div className="flex items-center justify-around">
                {/* Add to carousel */}
                <button className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white active:opacity-60"
                  onClick={() => {
                    const item = viewerItem; setViewerItem(null);
                    if (carouselIds.length > 0 && screen === "carousel") {
                      setCarouselIds((prev) => [...prev.filter((id) => id !== item.id), item.id]);
                      setTodayBuildMode(true);
                    } else {
                      enterSelectionMode("carousel", item.id);
                      goToScreen("pool");
                    }
                  }}>
                  <span className="text-2xl">📸</span>
                  <span className="text-[10px]">Carousel</span>
                </button>
                {/* Single post */}
                <button className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white active:opacity-60"
                  onClick={() => { const item = viewerItem; setViewerItem(null); openSinglePost(item); }}>
                  <span className="text-2xl">🖼️</span>
                  <span className="text-[10px]">Single Post</span>
                </button>
                {/* Favorite */}
                <button className="flex flex-col items-center gap-1.5 active:opacity-60"
                  onClick={() => setViewerFavorites((prev) => { const next = new Set(prev); isFav ? next.delete(viewerItem.id) : next.add(viewerItem.id); return next; })}>
                  <span className="text-2xl">{isFav ? "⭐" : "☆"}</span>
                  <span className={`text-[10px] ${isFav ? "text-amber-400" : "text-white/80"}`}>Favorite</span>
                </button>
                {/* Edit tag */}
                <button className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white active:opacity-60"
                  onClick={() => { const item = viewerItem; setTagPickerReturnItem(item); setViewerItem(null); setTagPickerItem(item); }}>
                  <span className="text-2xl">🏷️</span>
                  <span className="text-[10px]">Tag</span>
                </button>
                {/* Delete */}
                <button className="flex flex-col items-center gap-1.5 text-red-400 hover:text-red-300 active:opacity-60"
                  onClick={() => { const item = viewerItem; setViewerItem(null); handleDeleteMedia(item.id); }}>
                  <span className="text-2xl">🗑️</span>
                  <span className="text-[10px]">Delete</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── SINGLE POST POOL PICKER ── */}
      {singlePickerOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[hsl(220,14%,8%)]">
          <div className={`flex-shrink-0 flex items-center justify-between px-5 py-4 border-b ${border} bg-[hsl(220,14%,10%)]`}>
            <div>
              <p className="font-semibold">Choose Image</p>
              <p className={`text-xs ${dimText}`}>Tap any image to use it</p>
            </div>
            <button onClick={() => setSinglePickerOpen(false)} className={`${dimText} hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[hsl(220,14%,18%)]`}>✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {(() => {
              const allItems = mediaItems.filter((m) => !m.analyzing);
              if (!allItems.length) return <p className={`text-center ${dimText} text-sm py-10`}>No media in pool yet.</p>;
              return (
                <div className="grid grid-cols-3 gap-2">
                  {allItems.map((item) => {
                    const isCurrent = singlePostItem?.id === item.id;
                    return (
                      <button key={item.id}
                        onClick={() => {
                          setSinglePostItem(item);
                          setSinglePickerOpen(false);
                          setSingleCaption(""); setSingleCaptionOptions(null); setSingleCaptionIdx(null); setSingleEditing(false);
                        }}
                        className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all
                          ${isCurrent ? "border-[hsl(263,70%,65%)] opacity-60" : "border-transparent hover:border-[hsl(263,70%,65%)/50]"}`}>
                        {brokenImages.has(item.id) ? <div className="w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center text-3xl">{tagIcon(item.tag ?? "other")}</div> : <img src={item.dataUrl} alt="" className="w-full h-full object-cover" onError={() => setBrokenImages((p) => new Set([...p, item.id]))} />}
                        {isCurrent && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <span className="text-white text-xs font-semibold">Current</span>
                          </div>
                        )}
                        {item.tag && !isCurrent && (
                          <span className="absolute bottom-1 left-1 text-[9px] px-1 py-0.5 rounded bg-black/60 text-white">{tagIcon(item.tag)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── ADD MORE ── */}
      {addMoreOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-[hsl(220,14%,8%)]">
          <div className={`flex items-center justify-between px-5 py-4 border-b ${border} bg-[hsl(220,14%,10%)]`}>
            <div><p className="font-semibold">Add Media Files</p><p className={`text-xs ${dimText}`}>{carouselIds.length}/{MAX_CAROUSEL} slides selected</p></div>
            <button onClick={() => setAddMoreOpen(false)} className={`${dimText} hover:text-white text-xl`}>✕</button>
          </div>
          <div className={`flex items-center justify-between px-4 py-2.5 border-b ${border} bg-[hsl(220,14%,10%)]`}>
            <span className={`text-xs ${dimText}`}>Tap to add · tap again to remove</span>
            <div className="flex gap-2">
              <button onClick={() => addMoreLibraryRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(263,70%,65%)/15] text-[hsl(263,70%,70%)] border border-[hsl(263,70%,65%)/30] hover:bg-[hsl(263,70%,65%)/25]">🖼️ Camera Roll</button>
              <button onClick={() => addMoreCameraRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(263,70%,65%)/15] text-[hsl(263,70%,70%)] border border-[hsl(263,70%,65%)/30] hover:bg-[hsl(263,70%,65%)/25]">📷 Take Photo</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {(() => {
              const allItems = mediaItems.filter((m) => !m.analyzing && (editingPost ? true : !m.used));
              if (!allItems.length) return <p className={`text-center ${dimText} text-sm py-10`}>No media available.</p>;
              return (
                <div className="grid grid-cols-3 gap-2">
                  {allItems.map((item) => {
                    const selectedIdx = carouselIds.indexOf(item.id);
                    const isSelected = selectedIdx !== -1;
                    return (
                      <button key={item.id}
                        onClick={() => {
                          if (isSelected) {
                            setCarouselIds((prev) => prev.filter((id) => id !== item.id));
                          } else if (carouselIds.length < MAX_CAROUSEL) {
                            setCarouselIds((prev) => [...prev, item.id]);
                            setCaptionOptions(null); setCaptionSelectedIdx(null); setCarouselCaption("");
                          }
                        }}
                        className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all ${isSelected ? "border-[hsl(263,70%,65%)]" : "border-transparent hover:border-[hsl(263,70%,65%)/50]"}`}>
                        {isVideo(item.dataUrl) ? <video src={item.dataUrl} className="w-full h-full object-cover" /> : brokenImages.has(item.id) ? <div className="w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center text-3xl">{tagIcon(item.tag ?? "other")}</div> : <img src={item.dataUrl} alt="" className="w-full h-full object-cover" onError={() => setBrokenImages((p) => new Set([...p, item.id]))} />}
                        {/* Number badge */}
                        {isSelected && (
                          <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-[hsl(263,70%,65%)] flex items-center justify-center shadow-lg">
                            <span className="text-white text-[10px] font-bold">{selectedIdx + 1}</span>
                          </div>
                        )}
                        {/* Checkmark overlay */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-[hsl(263,70%,65%)/20] flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-[hsl(263,70%,65%)] flex items-center justify-center">
                              <span className="text-white text-sm font-bold">✓</span>
                            </div>
                          </div>
                        )}
                        {item.tag && !isSelected && <span className="absolute bottom-1 left-1 text-[9px] px-1 py-0.5 rounded bg-black/60 text-white">{tagIcon(item.tag)}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <div className={`p-4 border-t ${border} bg-[hsl(220,14%,10%)]`}>
            <button onClick={() => setAddMoreOpen(false)} className="w-full py-3 rounded-xl bg-[hsl(263,70%,65%)] text-white text-sm font-semibold">Done ({carouselIds.length} selected)</button>
          </div>
        </div>
      )}

      {/* ── INSTAGRAM PREVIEW MODAL (Feature 1) ── */}
      {previewPost && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm" onClick={() => setPreviewPost(null)}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-black border-b border-white/10 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-white">Post Preview</p>
            <button onClick={() => setPreviewPost(null)} className="text-white/60 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
          </div>
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto flex flex-col items-center py-4" onClick={(e) => e.stopPropagation()}>
            {/* Instagram post card */}
            <div className="w-full max-w-sm bg-black text-white">
              {/* Post header */}
              <div className="flex items-center px-3 py-2.5">
                {/* Avatar with IG gradient ring */}
                <div className="relative flex-shrink-0 mr-2.5">
                  <div className="w-9 h-9 rounded-full p-[2px]" style={{ background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" }}>
                    <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden">
                      <div className="w-full h-full rounded-full" style={{ background: "linear-gradient(135deg,#667eea,#764ba2)" }} />
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight text-white">{igUsername}</p>
                  <p className="text-[11px] text-white/50 leading-tight">{formatDayShort(previewPost.scheduledDate ?? previewPost.day)}</p>
                </div>
                <button className="ml-2 text-white/60 text-lg leading-none px-1">···</button>
              </div>

              {/* Image / carousel */}
              <div className="relative bg-black w-full"
                style={{ aspectRatio: "4/5" }}
                onTouchStart={(e) => { previewSwipeX.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                  if (previewSwipeX.current === null) return;
                  const d = e.changedTouches[0].clientX - previewSwipeX.current; previewSwipeX.current = null;
                  if (Math.abs(d) < 40) return;
                  if (d < 0 && previewSlide < previewItems.length - 1) setPreviewSlide((s) => s + 1);
                  else if (d > 0 && previewSlide > 0) setPreviewSlide((s) => s - 1);
                }}>
                {previewItems.length > 0 ? (
                  <>
                    {isVideo(previewItems[previewSlide]?.dataUrl ?? "")
                      ? <video src={previewItems[previewSlide].dataUrl} className="w-full h-full object-cover" autoPlay muted loop />
                      : <img src={previewItems[previewSlide]?.dataUrl ?? ""} alt="" className="w-full h-full object-cover" />}
                    {previewItems.length > 1 && (
                      <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full font-medium backdrop-blur-sm">
                        {previewSlide + 1}/{previewItems.length}
                      </div>
                    )}
                    {previewSlide > 0 && (
                      <button onClick={() => setPreviewSlide((s) => s - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white text-sm backdrop-blur-sm">‹</button>
                    )}
                    {previewSlide < previewItems.length - 1 && (
                      <button onClick={() => setPreviewSlide((s) => s + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white text-sm backdrop-blur-sm">›</button>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 text-4xl">🖼️</div>
                )}
              </div>

              {/* Dots (below image, IG style) */}
              {previewItems.length > 1 && (
                <div className="flex justify-center gap-[5px] py-2.5 bg-black">
                  {previewItems.map((_, i) => (
                    <button key={i} onClick={() => setPreviewSlide(i)}
                      className={`rounded-full transition-all ${i === previewSlide ? "w-2 h-2 bg-[#0095f6]" : "w-1.5 h-1.5 bg-white/30"}`} />
                  ))}
                </div>
              )}

              {/* Action bar */}
              <div className="flex items-center px-3 py-2">
                <div className="flex gap-4 flex-1">
                  <button className="text-white/90 hover:text-white/50 transition-colors">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </button>
                  <button className="text-white/90 hover:text-white/50 transition-colors">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </button>
                  <button className="text-white/90 hover:text-white/50 transition-colors">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
                <button className="text-white/90 hover:text-white/50 transition-colors">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
              </div>

              {/* Likes */}
              <div className="px-3 pb-1">
                <p className="text-sm font-semibold text-white">Liked by <span className="font-semibold">{igUsername}</span> and others</p>
              </div>

              {/* Caption */}
              {previewPost.caption && (
                <div className="px-3 pb-2">
                  <div className="text-sm text-white leading-snug">
                    <span className="font-semibold">{igUsername} </span>
                    <span className="text-white/90" style={{ whiteSpace: "pre-wrap" }}>
                      {previewPost.caption.length > 180 ? previewPost.caption.slice(0, 180) + "… " : previewPost.caption}
                    </span>
                    {previewPost.caption.length > 180 && <span className="text-white/50 text-sm">more</span>}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div className="px-3 pb-2">
                <p className="text-sm text-white/40">View all comments</p>
              </div>

              {/* Timestamp */}
              <div className="px-3 pb-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wide">{previewPost.scheduledTime ?? "12:00"} · {formatDayShort(previewPost.scheduledDate ?? previewPost.day)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DISCARD CHANGES CONFIRMATION ── */}
      {discardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setDiscardConfirm(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className={`relative w-full max-w-xs bg-[hsl(220,14%,13%)] border ${border} rounded-2xl p-6 space-y-4 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
                <span className="text-amber-400 text-xl">⚠️</span>
              </div>
              <p className="font-semibold text-[hsl(220,10%,90%)]">Discard changes?</p>
              <p className={`text-sm ${dimText} leading-relaxed`}>Any unsaved changes to this post will be lost.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDiscardConfirm(false)}
                className={`flex-1 py-2.5 rounded-xl border ${border} text-sm font-medium ${dimText} hover:bg-[hsl(220,14%,18%)] transition-colors`}>
                No, Keep Editing
              </button>
              <button onClick={() => { setDiscardConfirm(false); if (discardAction) { discardAction(); setDiscardAction(null); } }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors">
                Yes, Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION ── */}
      {deleteConfirmPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setDeleteConfirmPost(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className={`relative w-full max-w-xs bg-[hsl(220,14%,13%)] border ${border} rounded-2xl p-6 space-y-4 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
                <span className="text-red-400 text-xl">🗑️</span>
              </div>
              <p className="font-semibold text-[hsl(220,10%,90%)]">Delete this post?</p>
              <p className={`text-sm ${dimText} leading-relaxed`}>
                {(deleteConfirmPost.slideCount ?? 1) > 1
                  ? "The media files will be returned to your pool."
                  : "The media file will be returned to your pool."}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmPost(null)}
                className={`flex-1 py-2.5 rounded-xl border ${border} text-sm font-medium ${dimText} hover:bg-[hsl(220,14%,18%)] transition-colors`}>
                Cancel
              </button>
              <button onClick={() => confirmDeletePost(deleteConfirmPost)}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FIX 1: CONFIRM DELETE FOLDER ── */}
      {confirmDeleteFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setConfirmDeleteFolder(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className={`relative w-full max-w-xs bg-[hsl(220,14%,13%)] border ${border} rounded-2xl p-6 space-y-4 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
                <span className="text-red-400 text-xl">📁</span>
              </div>
              <p className="font-semibold text-[hsl(220,10%,90%)]">Delete this folder?</p>
              <p className={`text-sm ${dimText} leading-relaxed`}>The media inside will stay in your pool.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteFolder(false)}
                className={`flex-1 py-2.5 rounded-xl border ${border} text-sm font-medium ${dimText} hover:bg-[hsl(220,14%,18%)] transition-colors`}>
                Cancel
              </button>
              <button onClick={() => {
                if (openFolder) { handleDeleteFolder(openFolder.id); }
                setConfirmDeleteFolder(false);
              }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FIX 8: FOLDER LONG-PRESS CONTEXT MENU ── */}
      {longPressFolder && !folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setLongPressFolder(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className={`relative w-full max-w-sm bg-[hsl(220,14%,13%)] border-t ${border} rounded-t-2xl p-4 space-y-2 shadow-2xl pb-8`} onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider px-1 pb-1">📁 {longPressFolder.name}</p>
            <button className="w-full text-left px-4 py-3 rounded-xl text-sm text-[hsl(220,10%,85%)] hover:bg-[hsl(220,14%,18%)] transition-colors"
              onClick={() => { setOpenFolder(longPressFolder); setLongPressFolder(null); }}>Open folder</button>
            <button className="w-full text-left px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              onClick={() => { setFolderToDelete(longPressFolder); setLongPressFolder(null); }}>Delete folder</button>
            <button className="w-full text-left px-4 py-3 rounded-xl text-sm text-[hsl(220,10%,55%)] hover:bg-[hsl(220,14%,18%)] transition-colors"
              onClick={() => setLongPressFolder(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── FIX 8: CONFIRM DELETE FOLDER (from long press) ── */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setFolderToDelete(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className={`relative w-full max-w-xs bg-[hsl(220,14%,13%)] border ${border} rounded-2xl p-6 space-y-4 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
                <span className="text-red-400 text-xl">📁</span>
              </div>
              <p className="font-semibold text-[hsl(220,10%,90%)]">Delete "{folderToDelete.name}"?</p>
              <p className={`text-sm ${dimText} leading-relaxed`}>The media inside will stay in your pool.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setFolderToDelete(null)}
                className={`flex-1 py-2.5 rounded-xl border ${border} text-sm font-medium ${dimText} hover:bg-[hsl(220,14%,18%)] transition-colors`}>
                Cancel
              </button>
              <button onClick={() => { handleDeleteFolder(folderToDelete!.id); setFolderToDelete(null); }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FIX 1: CONFIRM REMOVE FROM FOLDER ── */}
      {confirmRemoveItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setConfirmRemoveItem(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className={`relative w-full max-w-xs bg-[hsl(220,14%,13%)] border ${border} rounded-2xl p-6 space-y-4 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-[hsl(263,70%,65%)/15] border border-[hsl(263,70%,65%)/30] flex items-center justify-center mx-auto overflow-hidden">
                {isVideo(confirmRemoveItem.dataUrl)
                  ? <video src={confirmRemoveItem.dataUrl} className="w-full h-full object-cover" />
                  : <img src={confirmRemoveItem.dataUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <p className="font-semibold text-[hsl(220,10%,90%)]">Remove from folder?</p>
              <p className={`text-sm ${dimText} leading-relaxed`}>The item will stay in your pool.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRemoveItem(null)}
                className={`flex-1 py-2.5 rounded-xl border ${border} text-sm font-medium ${dimText} hover:bg-[hsl(220,14%,18%)] transition-colors`}>
                Cancel
              </button>
              <button onClick={() => {
                if (openFolder && confirmRemoveItem) { handleRemoveFromFolder(openFolder.id, confirmRemoveItem.id); }
                setConfirmRemoveItem(null);
              }}
                className="flex-1 py-2.5 rounded-xl bg-[hsl(263,70%,60%)] hover:bg-[hsl(263,70%,55%)] text-white text-sm font-semibold transition-colors">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE FOLDER MODAL ── */}
      {createFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => { setCreateFolderOpen(false); setNewFolderName(""); setFolderNameError(false); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div className={`relative w-full max-w-xs bg-[hsl(220,14%,12%)] border ${border} rounded-2xl p-5 space-y-4`}
            onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">New Folder</p>
            <div className="space-y-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => { setNewFolderName(e.target.value); if (folderNameError) setFolderNameError(false); }}
                placeholder="Folder name…"
                className={`w-full ${inputCls} ${folderNameError ? "border-red-500/70 ring-1 ring-red-500/50" : ""}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitCreateFolder(); }
                  if (e.key === "Escape") { setCreateFolderOpen(false); setNewFolderName(""); setFolderNameError(false); }
                }}
              />
              {folderNameError && (
                <p className="text-xs text-red-400 px-1">Please enter a folder name.</p>
              )}
            </div>
            <p className={`text-xs ${dimText}`}>
              {bulkSelectedIds.length > 0
                ? `${bulkSelectedIds.length} selected item${bulkSelectedIds.length !== 1 ? "s" : ""} will be added.`
                : "Create an empty folder — or select items first."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setCreateFolderOpen(false); setNewFolderName(""); setFolderNameError(false); }}
                className={`flex-1 py-2 rounded-xl border ${border} text-sm ${dimText} hover:text-white transition-colors`}>
                Cancel
              </button>
              <button
                onClick={submitCreateFolder}
                className="flex-1 py-2 rounded-xl bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white text-sm font-medium transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOLDER PICKER MODAL (bulk move) ── */}
      {folderPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setFolderPickerOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className={`relative w-full max-w-xs bg-[hsl(220,14%,12%)] border ${border} rounded-2xl p-5 space-y-3`} onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">Move {bulkSelectedIds.length} item{bulkSelectedIds.length !== 1 ? "s" : ""} to Folder</p>
            {folders.length === 0 ? (
              <p className={`text-xs ${dimText} italic py-2`}>No folders yet — create one first.</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {folders.map((f) => (
                  <button key={f.id}
                    onClick={() => { handleMoveToFolder(f.id, bulkSelectedIds); setFolderPickerOpen(false); cancelBulkMode(); }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border ${border} hover:bg-[hsl(220,14%,18%)] text-sm flex items-center gap-3 transition-colors`}>
                    <span className="text-lg">📁</span>
                    <span>{f.name}</span>
                    <span className={`ml-auto text-xs ${dimText}`}>{f.mediaIds.length} items</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => { setFolderPickerOpen(false); setCreateFolderOpen(true); }}
              className={`w-full py-2.5 rounded-xl border-2 border-dashed border-[hsl(220,13%,25%)] hover:border-[hsl(263,70%,65%)/50] text-sm ${dimText} hover:text-white transition-colors`}>
              + New Folder
            </button>
            <button onClick={() => setFolderPickerOpen(false)} className={`w-full py-2 text-sm ${dimText} hover:text-white`}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── AI TYPE MODAL ── */}
      {aiTypeModal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={() => setAiTypeModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className={`relative w-full max-w-sm bg-[hsl(220,14%,12%)] border ${border} rounded-t-2xl flex flex-col`}
            style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <p className="font-semibold">AI Carousel</p>
              <button onClick={() => setAiTypeModal(false)} className={`${dimText} hover:text-white text-xl`}>✕</button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-2">
              {/* Source */}
              <div className={`rounded-xl border ${border} p-3 space-y-2`}>
                <p className={`text-xs font-medium ${dimText} uppercase tracking-wider`}>Media Source</p>
                <div className="flex gap-2">
                  {([["all", "🌐 All"], ["tag", "🏷️ Tag"], ["folder", "📁 Folder"]] as const).map(([val, label]) => (
                    <button key={val} onClick={() => { setAiCarouselSource(val); setAiCarouselTags([]); setAiCarouselFolderId(""); }}
                      className={`text-xs px-3 py-1.5 rounded-lg border flex-1 transition-all font-medium ${aiCarouselSource === val ? "bg-[hsl(263,70%,55%)] text-white border-[hsl(263,70%,55%)] shadow-sm" : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {aiCarouselSource === "tag" && (
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {allAvailableTags.map((tag) => {
                      const active = aiCarouselTags.includes(tag);
                      return (
                        <button key={tag}
                          onClick={() => setAiCarouselTags((prev) => active ? prev.filter((t) => t !== tag) : [...prev, tag])}
                          className={`text-[10px] px-2 py-1.5 rounded-lg border transition-colors ${active ? tagColor(tag, appSettings.customTags) + " ring-1 ring-inset ring-current" : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                          {tagIcon(tag)} {tagLabel(tag)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {aiCarouselSource === "tag" && aiCarouselTags.length === 0 && (
                  <p className={`text-[10px] ${dimText} italic`}>Tap tags to filter — multiple can be active.</p>
                )}
                {aiCarouselSource === "folder" && (
                  <div className="space-y-1 pt-1">
                    {folders.length === 0 ? (
                      <p className={`text-xs ${dimText} italic`}>No folders yet — create one in the Pool.</p>
                    ) : folders.map((f) => (
                      <button key={f.id} onClick={() => setAiCarouselFolderId(aiCarouselFolderId === f.id ? "" : f.id)}
                        className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors ${aiCarouselFolderId === f.id ? activeNavCls : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                        📁 {f.name} <span className="opacity-50">({f.mediaIds.length} items)</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Smart Picks toggle — rewritten from scratch */}
              <div className={`rounded-xl border ${border} p-4`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-[hsl(220,10%,85%)]">🎯 Smart Picks</p>
                    <p className={`text-xs mt-1 ${dimText}`}>
                      {aiRuleBasedEnabled ? "Me-first, preferred tags, best unused media" : "Random — AI picks freely from source"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiRuleBasedEnabled((v) => !v)}
                    style={{ width: 44, height: 24, borderRadius: 12, padding: 2, flexShrink: 0, position: "relative", backgroundColor: aiRuleBasedEnabled ? "hsl(263,70%,60%)" : "hsl(220,13%,22%)", border: "none", cursor: "pointer", transition: "background-color 0.2s" }}>
                    <span style={{
                      display: "block",
                      width: 20, height: 20, borderRadius: "50%",
                      backgroundColor: "white",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                      position: "absolute", top: 2,
                      left: aiRuleBasedEnabled ? 22 : 2,
                      transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              </div>
            </div>

            {/* Pinned Generate Now button */}
            <div className="px-5 pb-6 pt-3 flex-shrink-0 border-t border-[hsl(220,13%,18%)] space-y-2">
              <button onClick={handleAIGenerateRuleBased} disabled={aiGenerating}
                className="w-full py-3.5 rounded-xl bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white text-sm font-semibold disabled:opacity-40 transition-colors">
                {aiGenerating ? "Generating…" : "🎯 Generate Now"}
              </button>
              <p className={`text-center text-[10px] ${dimText}`}>
                {aiRuleBasedEnabled ? "Smart Picks on" : "Random pick"} · {getAISourcePool().length} items in source
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TAG PICKER ── */}
      {tagPickerItem && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={closeTagPicker}>
          <div className="absolute inset-0 bg-black/60" />
          <div className={`relative bg-[hsl(220,14%,12%)] border-t border-[hsl(220,13%,20%)] rounded-t-2xl p-5`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                  {isVideo(tagPickerItem.dataUrl) ? <video src={tagPickerItem.dataUrl} className="w-full h-full object-cover" /> : <img src={tagPickerItem.dataUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <div>
                  <p className="text-sm font-medium">Change tag</p>
                  <p className={`text-xs ${dimText} truncate max-w-[180px]`}>{tagPickerItem.name}</p>
                </div>
              </div>
              <button onClick={closeTagPicker} className={`${dimText} hover:text-white text-xl`}>✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {allAvailableTags.map((tag) => (
                <button key={tag} onClick={() => handleTagChange(tagPickerItem.id, tag)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${tagPickerItem.tag === tag ? tagColor(tag, appSettings.customTags) + " ring-1 ring-inset ring-current" : `${border} ${dimText} hover:bg-[hsl(220,14%,18%)]`}`}>
                  <span className="text-base">{tagIcon(tag)}</span><span>{tagLabel(tag)}</span>
                  {tagPickerItem.tag === tag && <span className="ml-auto text-xs">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── VIDEO TAG QUEUE ── */}
      {videoTagQueue.length > 0 && (() => {
        const currentVideo = videoTagQueue[0];
        return (
          <div className="fixed inset-0 z-40 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/80" />
            <div className={`relative bg-[hsl(220,14%,10%)] border-t border-[hsl(220,13%,20%)] rounded-t-3xl overflow-hidden`}>
              {/* Video player */}
              <div className="w-full bg-black" style={{ maxHeight: "40vh" }}>
                <video
                  key={currentVideo.id}
                  src={currentVideo.dataUrl}
                  controls
                  playsInline
                  muted
                  autoPlay
                  loop
                  className="w-full h-full object-contain"
                  style={{ maxHeight: "40vh" }}
                />
              </div>
              <div className="p-5 space-y-4">
                {/* Header */}
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Tag this video</p>
                    <span className={`text-xs ${dimText}`}>
                      {videoTagQueue.length > 1 ? `1 of ${videoTagQueue.length}` : ""}
                    </span>
                  </div>
                  <p className={`text-xs ${dimText} mt-0.5 truncate`}>{currentVideo.name}</p>
                  <p className="text-[11px] text-[hsl(220,10%,35%)] mt-0.5">AI can't analyze video — pick a tag below.</p>
                </div>
                {/* Tag grid */}
                <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto">
                  {allAvailableTags.map((tag) => (
                    <button key={tag} onClick={() => handleVideoTagSelect(tag)}
                      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border ${border} hover:bg-[hsl(220,14%,18%)] hover:border-[hsl(263,70%,65%)/40] ${dimText} transition-all`}>
                      <span className="text-xl">{tagIcon(tag)}</span>
                      <span className="text-[10px] font-medium">{tagLabel(tag)}</span>
                    </button>
                  ))}
                </div>
                {/* Progress dots */}
                {videoTagQueue.length > 1 && (
                  <div className="flex items-center justify-center gap-1.5 pb-1">
                    {Array.from({ length: videoTagQueue.length }).map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-[hsl(263,70%,65%)]" : "bg-[hsl(220,13%,28%)]"}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── VIDEO DISABLED BANNER ── */}
      {videoDisabledBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[hsl(25,90%,25%)] border-b border-[hsl(25,80%,35%)] px-4 py-3 flex items-center gap-3">
          <span className="text-lg">🎬</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-100">Video upload temporarily disabled</p>
            <p className="text-xs text-orange-200/80 mt-0.5">Coming in the next version. Only images are supported for now.</p>
          </div>
          <button onClick={() => setVideoDisabledBanner(false)} className="text-orange-200/60 hover:text-orange-100 text-lg leading-none">✕</button>
        </div>
      )}

      {/* ── DUPLICATES BANNER ── */}
      {duplicatesBanner.length > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[hsl(220,20%,15%)] border-b border-[hsl(220,13%,25%)] px-4 py-3 flex items-center gap-3">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[hsl(220,10%,85%)]">Duplicate{duplicatesBanner.length > 1 ? "s" : ""} skipped</p>
            <p className="text-xs text-[hsl(220,10%,55%)] mt-0.5 truncate">{duplicatesBanner.join(", ")}</p>
          </div>
          <button onClick={() => setDuplicatesBanner([])} className={`${dimText} hover:text-white text-lg leading-none`}>✕</button>
        </div>
      )}

      {/* ── FOLDER ADD SOURCE SHEET (Fix 2) ── */}
      {folderAddSourceSheet && openFolder && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setFolderAddSourceSheet(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className={`relative bg-[hsl(220,14%,11%)] border-t border-[hsl(220,13%,20%)] rounded-t-2xl p-5 space-y-3`} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-center pb-1">Add to <span className="text-[hsl(263,70%,70%)]">{openFolder.name}</span></p>
            <button onClick={() => { setFolderAddSourceSheet(false); setFolderAddMode(true); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border ${border} hover:bg-[hsl(220,14%,16%)] transition-colors`}>
              <span className="text-2xl">📁</span>
              <div className="text-left">
                <p className="text-sm font-semibold">From Pool</p>
                <p className={`text-xs ${dimText}`}>Choose from already uploaded media</p>
              </div>
            </button>
            <button onClick={() => { setFolderAddSourceSheet(false); folderCameraInputRef.current?.click(); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border ${border} hover:bg-[hsl(220,14%,16%)] transition-colors`}>
              <span className="text-2xl">📷</span>
              <div className="text-left">
                <p className="text-sm font-semibold">From Camera Roll</p>
                <p className={`text-xs ${dimText}`}>Upload new photos or videos</p>
              </div>
            </button>
            <button onClick={() => setFolderAddSourceSheet(false)} className={`w-full py-3 text-sm ${dimText} hover:text-white`}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── FOLDER ITEM CONTEXT MENU (Fix 6) ── */}
      {folderItemContextMenu && openFolder && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setFolderItemContextMenu(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className={`relative bg-[hsl(220,14%,11%)] border-t border-[hsl(220,13%,20%)] rounded-t-2xl p-5 space-y-2`} onClick={(e) => e.stopPropagation()}>
            {/* Preview */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                {isVideo(folderItemContextMenu.dataUrl)
                  ? <video src={folderItemContextMenu.dataUrl} className="w-full h-full object-cover" />
                  : <img src={folderItemContextMenu.dataUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div>
                <p className="text-sm font-semibold truncate max-w-[200px]">{folderItemContextMenu.name}</p>
                <p className={`text-xs ${dimText}`}>in {openFolder.name}</p>
              </div>
            </div>
            <button onClick={() => {
              handleRemoveFromFolder(openFolder.id, folderItemContextMenu.id);
              setFolderItemContextMenu(null);
            }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border ${border} hover:bg-[hsl(220,14%,16%)] transition-colors text-left`}>
              <span className="text-xl">📤</span>
              <div>
                <p className="text-sm font-semibold">Remove from Folder</p>
                <p className={`text-xs ${dimText}`}>Stays in your pool</p>
              </div>
            </button>
            <button onClick={() => {
              handleDeleteMedia(folderItemContextMenu.id);
              setFolderItemContextMenu(null);
            }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-red-500/20 hover:bg-red-500/10 transition-colors text-left">
              <span className="text-xl">🗑</span>
              <div>
                <p className="text-sm font-semibold text-red-400">Delete from Pool</p>
                <p className="text-xs text-red-400/60">Removed everywhere permanently</p>
              </div>
            </button>
            <button onClick={() => setFolderItemContextMenu(null)} className={`w-full py-3 text-sm ${dimText} hover:text-white`}>Cancel</button>
          </div>
        </div>
      )}

      {/* Hidden inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesAdded(files); e.target.value = ""; }} />
      <input ref={addMoreCameraRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesAdded(files, true); e.target.value = ""; }} />
      <input ref={addMoreLibraryRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesAdded(files); e.target.value = ""; }} />
      <input ref={folderCameraInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length && openFolder) handleFilesAdded(files, false, openFolder.id);
          e.target.value = "";
        }} />

      {plusMenuOpen && <div className="fixed inset-0 z-[15]" onClick={() => setPlusMenuOpen(false)} />}
      {(filterDropdownOpen || sortDropdownOpen) && <div className="fixed inset-0 z-10" onClick={() => { setFilterDropdownOpen(false); setSortDropdownOpen(false); }} />}
    </div>
  );
}
