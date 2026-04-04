import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, CircleUserRound, FolderPlus, Heart, LayoutTemplate, Pause, Play, Plus, Square, Tag, Trash2 } from "lucide-react";
import { createClient, Session } from "@supabase/supabase-js";
import { MediaItem, ApprovedPost, AppSettings, CaptionSettings, PoolSort, MediaFolder } from "./types";

// 🧪 TESTING ONLY — change to "pro" or "agency" to test different plans
// Change back to "free" before production release
const USER_PLAN: "free" | "pro" | "agency" = "pro";

// ─── Supabase client ──────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_TAG_LABELS: Record<string, string> = {
  me: "Me", outfit: "Outfit", food: "Food", drinks: "Drinks", dj: "DJ", vibe: "Vibe",
  friends: "Friends", location: "Location", city: "City", outdoor: "Outdoor", night: "Night",
  pet: "Pet", animal: "Animal", other: "Other",
};
const BASE_TAG_COLORS: Record<string, string> = {
  me: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  outfit: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  food: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  drinks: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  dj: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  vibe: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  friends: "bg-green-500/20 text-green-300 border-green-500/30",
  location: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  city: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  outdoor: "bg-lime-500/20 text-lime-300 border-lime-500/30",
  night: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  pet: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  animal: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  other: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};
const BASE_TAG_ICONS: Record<string, string> = {
  me: "🧍", outfit: "👗", food: "🍽️", drinks: "🍹", dj: "🎧", vibe: "✨",
  friends: "👥", location: "📍", city: "🏙️", outdoor: "🌿", night: "🌙",
  pet: "🐾", animal: "🦋", other: "📷",
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
function isVideo(dataUrl: string, mediaType?: string | null) {
  return mediaType === "video" || dataUrl.startsWith("data:video/") || /\.(mp4|mov|avi|webm)(\?|$)/i.test(dataUrl);
}
function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function captureVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.preload = "metadata";
    let done = false;
    const finish = (result: string) => {
      if (!done) { done = true; URL.revokeObjectURL(objectUrl); resolve(result); }
    };
    const timeout = setTimeout(() => finish(""), 10000);
    const drawFrame = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 400;
        const h = video.videoHeight || 500;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) { ctx.drawImage(video, 0, 0, w, h); clearTimeout(timeout); finish(canvas.toDataURL("image/jpeg", 0.7)); }
        else { clearTimeout(timeout); finish(""); }
      } catch { clearTimeout(timeout); finish(""); }
    };
    video.onloadeddata = () => { video.currentTime = 0.5; };
    video.onseeked = drawFrame;
    video.onloadedmetadata = () => { video.currentTime = 0.5; };
    video.onerror = () => { clearTimeout(timeout); finish(""); };
    video.src = objectUrl;
  });
}
function getVideoDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { URL.revokeObjectURL(objectUrl); resolve(isFinite(video.duration) ? video.duration : 0); };
    video.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(0); };
    video.src = objectUrl;
  });
}
function getVideoDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(isFinite(video.duration) ? video.duration : 0);
    video.onerror = () => resolve(0);
    video.src = src;
  });
}

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

async function getAuthToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function handle401(status: number) {
  if (status === 401) {
    supabase?.auth.signOut();
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api${path}`, { headers });
  handle401(res.status);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}
async function apiPost(path: string, body: object) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  handle401(res.status);
  if (!res.ok) {
    const err: any = new Error(`POST ${path} failed: ${res.status}`);
    err.status = res.status;
    try { err.data = await res.json(); } catch {}
    throw err;
  }
  return res.json();
}
async function computeFileHash(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
}
async function getImageDimensions(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(`${img.naturalWidth}x${img.naturalHeight}`); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(""); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
async function apiPatch(path: string, body: object) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api${path}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  handle401(res.status);
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json();
}
async function apiPut(path: string, body: object) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api${path}`, { method: "PUT", headers, body: JSON.stringify(body) });
  handle401(res.status);
  if (!res.ok) {
    const err: any = new Error(`PUT ${path} failed: ${res.status}`);
    err.status = res.status;
    try { err.data = await res.json(); } catch {}
    throw err;
  }
  return res.json();
}
async function apiDelete(path: string) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api${path}`, { method: "DELETE", headers });
  handle401(res.status);
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

async function generateSingleCaption(tags: string[], cs: CaptionSettings, userIdeas?: string, onChunk?: (partial: string) => void): Promise<string> {
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

  if (onChunk) {
    const streamHeaders = await authHeaders();
    const res = await fetch(`${API_BASE}/api/claude`, {
      method: "POST",
      headers: streamHeaders,
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 200, stream: true, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok || !res.body) throw new Error(`Caption request failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;
        try {
          const evt = JSON.parse(jsonStr);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            fullText += evt.delta.text;
            onChunk(fullText);
          }
        } catch { /* skip malformed */ }
      }
    }
    if (!fullText) throw new Error("Empty response");
    return fullText;
  }

  const data = await apiPost("/claude", {
    model: "claude-haiku-4-5-20251001", max_tokens: 200,
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

// ─── Date / Time picker components ───────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_HEADERS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function DatePicker({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const parsed = value ? new Date(value + "T00:00:00") : null;
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parsed ? parsed.getFullYear() : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsed ? parsed.getMonth() : new Date().getMonth());
  const today = new Date();

  const display = parsed
    ? parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "Select date";

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }
  function selectDay(day: number) {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${viewYear}-${m}-${d}`);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={className} style={{ textAlign: "left", cursor: "pointer" }}>
        {display}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-[hsl(220,14%,12%)] border border-[hsl(220,13%,22%)] rounded-xl shadow-2xl p-3" style={{ width: 248 }}>
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[hsl(220,14%,22%)] text-[hsl(220,10%,55%)] hover:text-white text-lg leading-none">‹</button>
              <span className="text-sm font-semibold text-[hsl(220,10%,88%)]">{MONTHS[viewMonth]} {viewYear}</span>
              <button type="button" onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[hsl(220,14%,22%)] text-[hsl(220,10%,55%)] hover:text-white text-lg leading-none">›</button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {DAY_HEADERS.map((h) => (
                <div key={h} className="text-center text-[10px] text-[hsl(220,10%,38%)] font-medium py-0.5">{h}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const mStr = String(viewMonth + 1).padStart(2, "0");
                const dStr = String(day).padStart(2, "0");
                const dateStr = `${viewYear}-${mStr}-${dStr}`;
                const isSelected = value === dateStr;
                const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
                return (
                  <button type="button" key={day} onClick={() => selectDay(day)}
                    className={`w-8 h-8 mx-auto flex items-center justify-center rounded-full text-xs font-medium transition-colors
                      ${isSelected ? "bg-[hsl(263,70%,65%)] text-white" :
                        isToday ? "border border-[hsl(263,70%,65%)] text-[hsl(263,70%,70%)]" :
                        "text-[hsl(220,10%,72%)] hover:bg-[hsl(220,14%,22%)]"}`}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LazyImg({ src, alt, className, onError }: { src: string; alt?: string; className?: string; onError?: () => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative w-full h-full">
      {!loaded && <div className="absolute inset-0 bg-[hsl(220,14%,16%)] animate-pulse" />}
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        decoding="async"
        className={`w-full h-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"} ${className ?? ""}`}
        onLoad={() => setLoaded(true)}
        onError={() => { setLoaded(true); onError?.(); }}
      />
    </div>
  );
}

function TimePicker({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }

  function formatDisplay(t: string) {
    if (!t) return "Select time";
    const [hStr, mStr] = t.split(":");
    const h = parseInt(hStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${mStr} ${ampm}`;
  }

  function getNearestTime() {
    const now = new Date();
    const h = now.getHours();
    const rawM = now.getMinutes();
    const m = Math.ceil(rawM / 15) * 15;
    if (m >= 60) {
      const nh = (h + 1) % 24;
      return `${String(nh).padStart(2, "0")}:00`;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  useEffect(() => {
    if (open && listRef.current) {
      const target = value || getNearestTime();
      const idx = times.indexOf(target);
      const scrollIdx = idx !== -1 ? idx : times.indexOf(getNearestTime());
      if (scrollIdx !== -1) {
        const children = listRef.current.children;
        if (children[scrollIdx]) (children[scrollIdx] as HTMLElement).scrollIntoView({ block: "center" });
      }
    }
  }, [open]);

  function parseInput(text: string): string | null {
    const t = text.trim();
    const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      const h = parseInt(match24[1]);
      const m = parseInt(match24[2]);
      if (h >= 0 && h < 24 && m >= 0 && m < 60)
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const match12 = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (match12) {
      let h = parseInt(match12[1]);
      const m = parseInt(match12[2]);
      const period = match12[3].toLowerCase();
      if (period === "pm" && h !== 12) h += 12;
      if (period === "am" && h === 12) h = 0;
      if (h >= 0 && h < 24 && m >= 0 && m < 60)
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return null;
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const parsed = parseInput(inputText);
      if (parsed) { onChange(parsed); setInputText(""); setOpen(false); }
    }
    if (e.key === "Escape") { setOpen(false); setInputText(""); }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen((o) => !o); setInputText(""); }} className={className} style={{ textAlign: "left", cursor: "pointer" }}>
        {formatDisplay(value)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setInputText(""); }} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-[hsl(220,14%,12%)] border border-[hsl(220,13%,22%)] rounded-xl shadow-2xl overflow-hidden" style={{ width: 150 }}>
            <div className="p-2 border-b border-[hsl(220,13%,22%)]">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={formatDisplay(value) || "e.g. 14:30"}
                autoFocus
                className="w-full bg-[hsl(220,14%,18%)] border border-[hsl(220,13%,28%)] rounded-lg px-2 py-1 text-xs text-[hsl(220,10%,85%)] placeholder-[hsl(220,10%,45%)] focus:outline-none focus:border-[hsl(263,70%,55%)]"
              />
            </div>
            <div ref={listRef} style={{ maxHeight: 192, overflowY: "auto" }}>
              {times.map((t) => (
                <button type="button" key={t} onClick={() => { onChange(t); setInputText(""); setOpen(false); }}
                  className={`w-full px-3 py-1.5 text-sm text-left transition-colors
                    ${value === t ? "bg-[hsl(263,70%,65%)] text-white font-semibold" : "text-[hsl(220,10%,72%)] hover:bg-[hsl(220,14%,22%)]"}`}>
                  {formatDisplay(t)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Freemium Plan Config ──────────────────────────────────────────────────────
const PLAN_LIMITS = {
  free:   { maxPostsPerMonth: 7, maxMedia: 30, maxFolders: 1, aiCaptions: false, aiTagging: false, videoUpload: false },
  pro:    { maxPostsPerMonth: Infinity, maxMedia: Infinity, maxFolders: Infinity, aiCaptions: true, aiTagging: true, videoUpload: true },
  agency: { maxPostsPerMonth: Infinity, maxMedia: Infinity, maxFolders: Infinity, aiCaptions: true, aiTagging: true, videoUpload: true },
};
const PLAN_LABELS: Record<"free" | "pro" | "agency", string> = { free: "Free", pro: "Pro 💎", agency: "Agency 💎" };

function DiamondBadge() {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center" onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }}>
      <span className="text-[hsl(263,70%,65%)] text-[11px] ml-1 cursor-pointer select-none" title="Pro feature — upgrade to unlock">💎</span>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 rounded-lg bg-[hsl(220,14%,20%)] border border-[hsl(263,70%,65%)/40] text-[10px] text-[hsl(220,10%,70%)] px-2.5 py-1.5 text-center z-50 pointer-events-none shadow-lg">
          Pro feature — upgrade to unlock
        </span>
      )}
    </span>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const border = "border-[hsl(220,13%,18%)]";
  const inputCls = "w-full bg-[hsl(220,14%,9%)] border border-[hsl(220,13%,22%)] rounded-xl px-4 py-3 text-sm text-[hsl(220,10%,85%)] placeholder:text-[hsl(220,10%,35%)] focus:outline-none focus:border-[hsl(263,70%,65%)/60] transition-colors";

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!supabase) { setError("Auth not configured — VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY required"); return; }
    setLoading(true); setError(null); setMessage(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setError(error.message);
        else setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) setError(error.message);
        else setMessage("Password reset link sent — check your email.");
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(220,14%,8%)] flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">📸</span>
            <span className="text-2xl font-bold tracking-tight text-white">InstaFlow</span>
          </div>
          <p className="text-sm text-[hsl(220,10%,50%)]">Your Instagram content workflow</p>
        </div>

        {/* Card */}
        <div className={`rounded-2xl border ${border} bg-[hsl(220,14%,11%)] p-6 space-y-5`}>
          <h2 className="text-base font-semibold text-white">
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
          </h2>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputCls}
            />
            {mode !== "forgot" && (
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={inputCls}
              />
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white text-sm font-semibold transition-colors disabled:opacity-60">
              {loading ? "Please wait…" : mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
            </button>
          </form>

          {mode !== "forgot" && (
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setMessage(null); }}
              className="w-full text-sm text-[hsl(220,10%,50%)] hover:text-white transition-colors text-center">
              {mode === "signin" ? "Don't have an account? Create one" : "Already have an account? Sign in"}
            </button>
          )}

          {mode === "signin" && (
            <button
              onClick={() => { setMode("forgot"); setError(null); setMessage(null); }}
              className="w-full text-xs text-[hsl(220,10%,40%)] hover:text-[hsl(220,10%,65%)] transition-colors text-center">
              Forgot password?
            </button>
          )}

          {mode === "forgot" && (
            <button
              onClick={() => { setMode("signin"); setError(null); setMessage(null); }}
              className="w-full text-sm text-[hsl(220,10%,50%)] hover:text-white transition-colors text-center">
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
type Screen = "pool" | "carousel" | "calendar" | "settings" | "single" | "profile";
const LAST_TAB_KEY = "instaflow_last_tab";

export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaHasMore, setMediaHasMore] = useState(false);
  const [mediaTotal, setMediaTotal] = useState(0);
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
  const carouselCaptionRef = useRef<HTMLTextAreaElement>(null);
  const singleCaptionRef = useRef<HTMLTextAreaElement>(null);
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
  const [todayBuildMode, setTodayBuildMode] = useState(false);
  const [createPostModal, setCreatePostModal] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Fix 3: Video poster frames (mediaId → data URL) and which video is playing
  const [videoPosters, setVideoPosters] = useState<Record<string, string>>({});
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [viewerControlsVisible, setViewerControlsVisible] = useState(true);
  const viewerControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk selection (pool)
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);

  // Caption user ideas
  const [captionUserIdeas, setCaptionUserIdeas] = useState("");

  // Video upload progress
  const [videoUploadProgress, setVideoUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // Freemium plan
  const plan = USER_PLAN;
  const limits = PLAN_LIMITS[plan];
  const [monthPostCount, setMonthPostCount] = useState(0);
  const [postUsedAICaption, setPostUsedAICaption] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeModalData, setUpgradeModalData] = useState<{ reasons: string[]; canContinue: boolean; onContinue: () => void } | null>(null);

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
  const [discardSaveDraftAction, setDiscardSaveDraftAction] = useState<(() => void) | null>(null);

  // Fullscreen viewer
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null);
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
  const viewerVideoRef = useRef<HTMLVideoElement>(null);
  const [viewerDelta, setViewerDelta] = useState(0);
  const [viewerDragging, setViewerDragging] = useState(false);
  const [swipeHintVisible, setSwipeHintVisible] = useState(false);
  const [viewerTagPickerOpen, setViewerTagPickerOpen] = useState(false);
  const viewerSwipeStartX = useRef<number | null>(null);
  const viewerRafRef = useRef<number | null>(null);
  const viewerPendingX = useRef(0);

  // Used-section viewer (separate from pool viewer)
  const [usedViewerItem, setUsedViewerItem] = useState<MediaItem | null>(null);
  const [usedViewerPost, setUsedViewerPost] = useState<ApprovedPost | null>(null);
  const [usedViewerRemoveConfirm, setUsedViewerRemoveConfirm] = useState(false);

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
  const folderFileInputRef = useRef<HTMLInputElement>(null);
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

  // Offline + global toast
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [globalToast, setGlobalToast] = useState<string | null>(null);
  const globalToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Profile
  const [profile, setProfile] = useState<{ display_name: string | null; instagram_username: string | null; caption_style: string; language: string; timezone: string; plan: string; avatar_url: string | null } | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileInstagram, setProfileInstagram] = useState("");
  const [profileLanguage, setProfileLanguage] = useState("en");
  const [profileTimezone, setProfileTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [preventDuplicates, setPreventDuplicates] = useState(true);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  // Onboarding
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(1);
  // Email verification
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("");
  const [profilePasswordSaving, setProfilePasswordSaving] = useState(false);
  const [profilePasswordMsg, setProfilePasswordMsg] = useState<string | null>(null);
  const [profileBillingPeriod, setProfileBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [profileSubpage, setProfileSubpage] = useState<null | "profile" | "usage" | "billing" | "account" | "preferences">(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { localStorage.setItem(LAST_TAB_KEY, screen); }, [screen]);

  useEffect(() => {
    const handle = { timer: null as ReturnType<typeof setTimeout> | null };
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      if (handle.timer) clearTimeout(handle.timer);
      setGlobalToast("Back online!");
      handle.timer = setTimeout(() => setGlobalToast(null), 3000);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      if (handle.timer) clearTimeout(handle.timer);
    };
  }, []);

  // Load + reconcile on mount
  useEffect(() => {
    async function loadAll() {
      try {
        const [mediaResp, posts, settings, rawFolders, countData] = await Promise.all([
          apiGet<{ items: any[]; hasMore: boolean; total: number; page: number }>("/media?page=1"),
          apiGet<any[]>("/posts"),
          apiGet<Record<string, string>>("/settings"),
          apiGet<any[]>("/folders").catch(() => []),
          apiGet<{ count: number }>("/posts/count").catch(() => ({ count: 0 })),
        ]);
        setMonthPostCount(countData.count ?? 0);
        const items: MediaItem[] = (mediaResp.items ?? []).map((i: any) => ({ ...i, analyzing: false }));
        setMediaHasMore(mediaResp.hasMore ?? false);
        setMediaPage(1);
        setMediaTotal(mediaResp.total ?? items.length);
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
      } catch (err) { console.error("Failed to load", err); showGlobalToast("Couldn't load data — pull to refresh"); }
      finally { setMediaLoading(false); }
    }
    loadAll();
  }, []);

  // ── Profile fetch + handlers ─────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    // Check email verification
    supabase?.auth.getUser().then(({ data }) => {
      setEmailVerified(!!(data?.user?.email_confirmed_at));
    }).catch(() => setEmailVerified(false));
    // Load profile
    apiGet<any>("/profile").then((p) => {
      setProfile(p);
      setProfileDisplayName(p.display_name ?? "");
      setProfileInstagram(p.instagram_username ?? "");
      setProfileLanguage(p.language ?? "en");
      setProfileTimezone(p.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
      setPreventDuplicates(p.prevent_duplicates ?? true);
      setProfileAvatarUrl(p.avatar_url ?? null);
      setOnboardingComplete(p.onboarding_complete ?? false);
    }).catch(() => { setOnboardingComplete(true); }); // fail-safe: don't block app
  }, [session]);

  async function handleSaveProfile() {
    setProfileSaving(true);
    try {
      const saved = await apiPost("/profile", {
        display_name: profileDisplayName || null,
        instagram_username: profileInstagram || null,
        language: profileLanguage,
        timezone: profileTimezone,
        prevent_duplicates: preventDuplicates,
        avatar_url: profileAvatarUrl,
        onboarding_complete: true,
      });
      setProfile(saved);
      setProfileSaved(true);
      showGlobalToast("Profile saved!");
      setTimeout(() => setProfileSaved(false), 2000);
    } catch { showGlobalToast("Failed to save profile"); }
    finally { setProfileSaving(false); }
  }

  async function handleChangePassword() {
    if (!supabase) return;
    if (profileNewPassword !== profileConfirmPassword) {
      setProfilePasswordMsg("Passwords don't match");
      return;
    }
    if (profileNewPassword.length < 6) {
      setProfilePasswordMsg("Password must be at least 6 characters");
      return;
    }
    setProfilePasswordSaving(true);
    setProfilePasswordMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: profileNewPassword });
      if (error) throw error;
      setProfilePasswordMsg("✓ Password updated");
      setProfileNewPassword("");
      setProfileConfirmPassword("");
    } catch (err: any) {
      setProfilePasswordMsg(err?.message ?? "Failed to update password");
    } finally { setProfilePasswordSaving(false); }
  }

  async function handleForgotPassword() {
    if (!supabase || !session?.user?.email) return;
    try {
      await supabase.auth.resetPasswordForEmail(session.user.email, {
        redirectTo: "https://instaflow-web-app.vercel.app/reset-password",
      });
      showGlobalToast("Password reset email sent!");
    } catch { showGlobalToast("Failed to send reset email"); }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:...;base64,
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { url } = await apiPost("/profile/avatar", { base64, mimeType: file.type }) as any;
      const urlWithBust = url + `?t=${Date.now()}`;
      setProfileAvatarUrl(urlWithBust);
      showGlobalToast("Avatar updated!");
    } catch (err) {
      console.error("Avatar upload failed:", err);
      showGlobalToast("Avatar upload failed — please try again");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeleteAccount() {
    if (!supabase) return;
    try {
      await apiDelete("/profile");
    } catch (err) {
      console.error("Delete account error:", err);
    }
    // Sign out regardless — auth user is gone server-side
    try { await supabase.auth.signOut(); } catch {}
    showGlobalToast("Account deleted successfully");
    setDeleteAccountConfirm(false);
  }

  async function completeOnboarding() {
    setOnboardingComplete(true);
    try {
      await apiPost("/profile", {
        display_name: profileDisplayName || null,
        instagram_username: profileInstagram || null,
        language: profileLanguage,
        timezone: profileTimezone,
        prevent_duplicates: preventDuplicates,
        avatar_url: profileAvatarUrl,
        onboarding_complete: true,
      });
    } catch {}
  }

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
    } catch (err) { console.error("Failed to load more", err); showGlobalToast("Couldn't load more items — please try again"); }
    finally { setMediaLoadingMore(false); }
  }

  // Sync thumbnail_url from loaded media items into videoPosters (for items already in DB)
  useEffect(() => {
    const toSync: Record<string, string> = {};
    mediaItems.forEach((m) => { if (m.thumbnail_url && !videoPosters[m.id]) toSync[m.id] = m.thumbnail_url; });
    if (Object.keys(toSync).length > 0) setVideoPosters((prev) => ({ ...prev, ...toSync }));
  }, [mediaItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand caption textareas when value is set programmatically (e.g. AI generation)
  useEffect(() => {
    if (carouselCaptionRef.current) {
      carouselCaptionRef.current.style.height = "auto";
      carouselCaptionRef.current.style.height = carouselCaptionRef.current.scrollHeight + "px";
    }
  }, [carouselCaption]);
  useEffect(() => {
    if (singleCaptionRef.current) {
      singleCaptionRef.current.style.height = "auto";
      singleCaptionRef.current.style.height = singleCaptionRef.current.scrollHeight + "px";
    }
  }, [singleCaption]);

  // Auto-play videos when carousel slide changes
  useEffect(() => {
    const slide = carouselIds[carouselIndex] ? mediaItems.find((m) => m.id === carouselIds[carouselIndex]) : null;
    if (slide && isVideo(slide.dataUrl, slide.media_type)) {
      setPlayingVideoId(slide.id);
    } else {
      setPlayingVideoId(null);
    }
  }, [carouselIndex, carouselIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
  ].sort((a, b) => {
    const aOther = a.toLowerCase() === "other" || a.toLowerCase().endsWith(" other");
    const bOther = b.toLowerCase() === "other" || b.toLowerCase().endsWith(" other");
    if (aOther && !bOther) return 1;
    if (!aOther && bOther) return -1;
    return 0;
  }), [appSettings.hiddenBaseTags, appSettings.customTags]);

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
    if (filterFavoritesOnly) items = items.filter((m) => m.isFavorite);
    if (poolSort === "oldest") items.sort((a, b) => (a.createdAt ?? "") < (b.createdAt ?? "") ? -1 : 1);
    else if (poolSort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
    else items.sort((a, b) => (a.createdAt ?? "") > (b.createdAt ?? "") ? -1 : 1);
    return items;
  }, [mediaItems, activeFilters, filterFavoritesOnly, poolSort, usedFilter, folderItemIds]);

  const tagsInActivePool = allAvailableTags;

  // Viewer swipe navigation list
  const [viewerNavList, viewerNavIdx] = useMemo((): [MediaItem[], number] => {
    if (!viewerItem) return [[], -1];
    const idx = filteredSortedMedia.findIndex(m => m.id === viewerItem.id);
    if (idx >= 0) return [filteredSortedMedia, idx];
    const idx2 = mediaItems.findIndex(m => m.id === viewerItem.id);
    return [mediaItems, idx2];
  }, [viewerItem, filteredSortedMedia, mediaItems]);

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

    if (videoFiles.length > 0 && !limits.videoUpload) {
      setUpgradeModalData({ reasons: ["Video Upload & Playback"], canContinue: false, onContinue: () => {} });
      setUpgradeModalOpen(true);
      if (imageFiles.length === 0) return;
    }

    if (plan === "free") {
      const currentCount = await refreshMediaTotal();
      const slotsRemaining = limits.maxMedia - currentCount;
      if (slotsRemaining <= 0) {
        setUpgradeModalData({ reasons: [`Media pool limit (${limits.maxMedia} items on Free)`], canContinue: false, onContinue: () => {} });
        setUpgradeModalOpen(true);
        return;
      }
      if (imageFiles.length > slotsRemaining) {
        setUpgradeModalData({
          reasons: [`You can only upload ${slotsRemaining} more file(s). Select fewer files or upgrade to Pro.`],
          canContinue: false, onContinue: () => {},
        });
        setUpgradeModalOpen(true);
        return;
      }
    }

    // Compute SHA-256 hashes for all image files in parallel (cross-device dedup)
    const imageFileHashes = await Promise.all(imageFiles.map(computeFileHash));
    // Duplicate detection — hash match OR name+size match
    const newImageFilesWithMeta = imageFiles
      .map((f, i) => ({ file: f, hash: imageFileHashes[i] }))
      .filter(({ file, hash }) =>
        !mediaItems.some((m) =>
          (hash && m.fileHash && m.fileHash === hash) ||
          (m.name === file.name && (!m.fileSize || m.fileSize === file.size))
        )
      );
    const duplicateFiles = imageFiles.filter((f, i) =>
      !newImageFilesWithMeta.some(({ file }) => file === f)
    );
    if (duplicateFiles.length > 0) {
      if (newImageFilesWithMeta.length === 0) {
        showGlobalToast("All selected files already exist in your pool");
        return;
      }
      setDuplicatesBanner(duplicateFiles.map((f) => f.name));
      setTimeout(() => setDuplicatesBanner([]), 5000);
    }

    // Process images in parallel (fast) — compute dimensions alongside compression
    const imageItems = await Promise.all(newImageFilesWithMeta.map(({ file, hash }) => new Promise<MediaItem>((resolve) => {
      const dimsPromise = getImageDimensions(file);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const raw = e.target?.result as string;
        const [dataUrl, dimensions] = await Promise.all([compressImage(raw), dimsPromise]);
        resolve({ id: generateId(), name: file.name, tag: null, analyzing: true, dataUrl, used: false, fileSize: file.size, fileHash: hash, dimensions });
      };
      reader.readAsDataURL(file);
    })));

    // Process videos sequentially (heavy files — generate thumbnail + duration + upload)
    const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
    const videoItems: MediaItem[] = [];
    if (videoFiles.length > 0 && limits.videoUpload) {
      setVideoUploadProgress({ current: 0, total: videoFiles.length });
      for (let i = 0; i < videoFiles.length; i++) {
        setVideoUploadProgress({ current: i + 1, total: videoFiles.length });
        const f = videoFiles[i];
        // 50 MB hard cap — reject before reading
        if (f.size > MAX_VIDEO_BYTES) {
          showGlobalToast(`Video too large — max 50 MB supported (${f.name})`);
          continue;
        }
        showGlobalToast(`Uploading video (${Math.round(f.size / 1024 / 1024)} MB)…`);
        // Generate thumbnail + duration from raw File (no base64 needed yet)
        const [thumbUrl, duration] = await Promise.all([
          captureVideoThumbnail(f),
          getVideoDurationFromFile(f),
        ]);
        // Only read to base64 after thumbnail is done (avoids double memory peak)
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(f);
        });
        const item: MediaItem = {
          id: generateId(), name: f.name, tag: "video", analyzing: false,
          dataUrl, used: false, media_type: "video",
          thumbnail_url: thumbUrl || undefined, duration: duration || undefined,
        };
        setMediaItems((prev) => [...prev, item]);
        if (thumbUrl) setVideoPosters((prev) => ({ ...prev, [item.id]: thumbUrl }));
        videoItems.push(item);
      }
      setVideoUploadProgress(null);
    }

    const withData = [...imageItems, ...videoItems];

    if (imageItems.length > 0) {
      if (addToCarousel) {
        const toAdd = imageItems.slice(0, MAX_CAROUSEL - carouselIds.length);
        setMediaItems((prev) => [...prev, ...imageItems]);
        setCarouselIds((prev) => [...prev, ...toAdd.map((m) => m.id)]);
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

    // Upload video items to backend
    for (const item of videoItems) {
      const fileSizeMB = item.dataUrl ? Math.round(item.dataUrl.length * 0.75 / 1024 / 1024) : 0;
      if (fileSizeMB > 5) showGlobalToast(`Uploading video (${fileSizeMB} MB)… please wait`);
      try {
        const saved = await apiPost("/media/upload", {
          id: item.id, name: item.name, dataUrl: item.dataUrl,
          tag: "video", fileHash: "", fileSize: 0, dimensions: "",
          media_type: "video",
          thumbnail_url: item.thumbnail_url || "",
          duration: item.duration || 0,
        });
        const storedUrl: string = (saved as any).dataUrl ?? item.dataUrl;
        if (storedUrl !== item.dataUrl) {
          setMediaItems((prev) => prev.map((m) => m.id === item.id ? { ...m, dataUrl: storedUrl } : m));
        }
        setMediaTotal((t) => t + 1);
        if (fileSizeMB > 5) showGlobalToast("Video uploaded successfully");
      } catch (err) {
        console.error("Failed to save video", err);
        showGlobalToast("Video upload failed — please try again");
        setMediaItems((prev) => prev.filter((m) => m.id !== item.id));
        setVideoPosters((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      }
    }

    // Auto-tag images (using base64 still in state), then upload+persist via /media/upload
    for (const item of imageItems) {
      // analyzeTag while item.dataUrl is still base64 (before Supabase upload)
      // Free plan: silently tag as "other" (no AI call)
      const tag = limits.aiTagging ? await analyzeTag(item.dataUrl, allAvailableTags) : "other";
      setMediaItems((prev) => prev.map((m) => m.id === item.id ? { ...m, tag, analyzing: false } : m));
      try {
        // Single endpoint: uploads to Supabase Storage AND saves DB record
        const saved = await apiPost("/media/upload", {
          id: item.id, name: item.name, dataUrl: item.dataUrl, tag,
          fileHash: item.fileHash ?? "", fileSize: item.fileSize ?? 0, dimensions: item.dimensions ?? "",
        });
        const storedUrl: string = (saved as any).dataUrl ?? item.dataUrl;
        // Swap local base64 for the persisted Supabase URL in state
        if (storedUrl !== item.dataUrl) {
          setMediaItems((prev) => prev.map((m) => m.id === item.id ? { ...m, dataUrl: storedUrl } : m));
        }
        setMediaTotal((t) => t + 1);
      } catch (err: any) {
        if (err?.status === 409) {
          // Server-side duplicate detected — remove the optimistically added item and notify
          showGlobalToast(err?.data?.message ?? "This file already exists in your pool");
          setMediaItems((prev) => prev.filter((m) => m.id !== item.id));
          setCarouselIds((prev) => prev.filter((cid) => cid !== item.id));
          continue;
        }
        console.error("Failed to save media", err);
        showGlobalToast("Upload failed — please try again");
      }
    }
    // Re-sync count from server after all uploads so mediaTotal always reflects DB truth
    refreshMediaTotal();
  }

  async function refreshMediaTotal(): Promise<number> {
    try {
      const r = await apiGet<{ total: number }>("/media/count");
      setMediaTotal(r.total);
      return r.total;
    } catch {
      return mediaTotal;
    }
  }

  async function handleDeleteMedia(id: string) {
    setMediaItems((prev) => prev.filter((m) => m.id !== id));
    setCarouselIds((prev) => prev.filter((cid) => cid !== id));
    setViewerItem(null);
    setMediaTotal((t) => Math.max(0, t - 1));
    try {
      await apiDelete(`/media/${id}`);
      refreshMediaTotal();
    } catch { showGlobalToast("Couldn't delete — please try again"); }
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
    if (plan === "free" && folders.length >= limits.maxFolders) {
      setCreateFolderOpen(false);
      openProGate("Folder limit — upgrade to Pro to create more folders");
      return;
    }
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
      await apiPost("/media/upload", {
        id: item.id, name: item.name, dataUrl: item.dataUrl, tag,
        fileHash: "", fileSize: 0, dimensions: "", media_type: "video",
        thumbnail_url: item.thumbnail_url || "", duration: item.duration || 0,
      });
      setMediaTotal((t) => t + 1);
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
    if (hasCarouselChanges()) {
      setDiscardAction(() => action);
      setDiscardSaveDraftAction(() => () => { handleSaveDraft(); });
      setDiscardConfirm(true);
    } else action();
  }

  function attemptCancelSingle(onDiscard: () => void) {
    const hasChanges = !!(singleCaption);
    if (hasChanges) {
      setDiscardAction(() => onDiscard);
      setDiscardSaveDraftAction(() => async () => {
        if (!singlePostItem) return;
        const draft: ApprovedPost = {
          id: generateId(), day: singleScheduleDate || todayStr(),
          caption: singleCaption || "",
          tagsSummary: tagIcon(singlePostItem.tag ?? "other"), slideCount: 1,
          scheduledDate: singleScheduleDate || null,
          scheduledTime: singleScheduleTime || null,
          mediaIds: [singlePostItem.id],
          status: "draft",
          createdAt: new Date().toISOString(),
        };
        setApprovedPosts((prev) => [draft, ...prev]);
        try { await apiPost("/posts", draft); } catch {}
        onDiscard();
      });
      setDiscardConfirm(true);
    } else onDiscard();
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

  async function handleRemoveFromPost() {
    if (!usedViewerItem || !usedViewerPost) return;
    const newMediaIds = (usedViewerPost.mediaIds ?? []).filter(id => id !== usedViewerItem.id);
    try {
      await apiPut(`/posts/${usedViewerPost.id}`, {
        day: usedViewerPost.day, caption: usedViewerPost.caption, tagsSummary: usedViewerPost.tagsSummary ?? "",
        slideCount: newMediaIds.length, scheduledDate: usedViewerPost.scheduledDate ?? null,
        scheduledTime: usedViewerPost.scheduledTime ?? null, mediaIds: newMediaIds,
        status: usedViewerPost.status ?? "approved",
        usedAICaption: usedViewerPost.usedAICaption ?? false, usedAITagging: usedViewerPost.usedAITagging ?? false,
        usedVideo: usedViewerPost.usedVideo ?? false,
      });
      setApprovedPosts(prev => prev.map(p => p.id === usedViewerPost!.id ? { ...p, mediaIds: newMediaIds } : p));
      setMediaItems(prev => prev.map(m => m.id === usedViewerItem!.id ? { ...m, used: false } : m));
      setUsedViewerItem(null); setUsedViewerPost(null); setUsedViewerRemoveConfirm(false);
      showGlobalToast("Removed from post");
    } catch { showGlobalToast("Failed to remove — please try again"); }
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

  // ── Viewer swipe navigation ──
  useEffect(() => {
    if (viewerItem && !sessionStorage.getItem("swipeHintShown")) {
      setSwipeHintVisible(true);
      sessionStorage.setItem("swipeHintShown", "1");
      const t = setTimeout(() => setSwipeHintVisible(false), 2000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!viewerItem]);

  function viewerGoNext() {
    if (viewerNavList.length === 0) return;
    const next = viewerNavList[(viewerNavIdx + 1) % viewerNavList.length];
    setViewerItem(next);
    setViewerDelta(0);
    setViewerDragging(false);
    setViewerTagPickerOpen(false);
    viewerSwipeStartX.current = null;
  }
  function viewerGoPrev() {
    if (viewerNavList.length === 0) return;
    const prev = viewerNavList[(viewerNavIdx - 1 + viewerNavList.length) % viewerNavList.length];
    setViewerItem(prev);
    setViewerDelta(0);
    setViewerDragging(false);
    setViewerTagPickerOpen(false);
    viewerSwipeStartX.current = null;
  }
  function onViewerDragStart(clientX: number) {
    viewerSwipeStartX.current = clientX;
    viewerPendingX.current = clientX;
    setViewerDragging(true);
  }
  function onViewerDragMove(clientX: number) {
    if (viewerSwipeStartX.current === null) return;
    viewerPendingX.current = clientX;
    if (viewerRafRef.current !== null) return;
    viewerRafRef.current = requestAnimationFrame(() => {
      if (viewerSwipeStartX.current !== null) {
        setViewerDelta(viewerPendingX.current - viewerSwipeStartX.current);
      }
      viewerRafRef.current = null;
    });
  }
  function onViewerDragEnd() {
    if (viewerSwipeStartX.current === null) return;
    if (viewerRafRef.current !== null) { cancelAnimationFrame(viewerRafRef.current); viewerRafRef.current = null; }
    const d = viewerPendingX.current - viewerSwipeStartX.current;
    viewerSwipeStartX.current = null;
    const W = window.innerWidth;
    if (d < -60 && viewerNavIdx < viewerNavList.length - 1) {
      // Animate strip fully to the left (next panel centred), then snap to new arrangement
      setViewerDelta(-W);
      setViewerDragging(false);
      setTimeout(() => {
        setViewerDragging(true);   // disable transition for instant reposition
        const next = viewerNavList[viewerNavIdx + 1];
        setViewerItem(next);
        setViewerDelta(0);
        setViewerTagPickerOpen(false);
        requestAnimationFrame(() => setViewerDragging(false));
      }, 310);
    } else if (d > 60 && viewerNavIdx > 0) {
      // Animate strip fully to the right (prev panel centred), then snap
      setViewerDelta(W);
      setViewerDragging(false);
      setTimeout(() => {
        setViewerDragging(true);
        const prev = viewerNavList[viewerNavIdx - 1];
        setViewerItem(prev);
        setViewerDelta(0);
        setViewerTagPickerOpen(false);
        requestAnimationFrame(() => setViewerDragging(false));
      }, 310);
    } else {
      setViewerDelta(0);
      setViewerDragging(false);
    }
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
  function showGlobalToast(msg: string) {
    if (globalToastTimer.current) clearTimeout(globalToastTimer.current);
    setGlobalToast(msg);
    globalToastTimer.current = setTimeout(() => setGlobalToast(null), 3500);
  }
  function openProGate(feature: string) {
    setUpgradeModalData({ reasons: [feature], canContinue: false, onContinue: () => {} });
    setUpgradeModalOpen(true);
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
    if (!limits.aiCaptions) {
      setUpgradeModalData({ reasons: ["AI Caption Generation"], canContinue: false, onContinue: () => {} });
      setUpgradeModalOpen(true);
      return;
    }
    setSingleGenerating(true); setSingleError(null); setSingleCaptionOptions(null); setSingleCaptionIdx(null);
    try {
      const prevCaption = singleCaption || undefined;
      const opts = await generate3Captions([singlePostItem.tag ?? "other"], appSettings.captionSettings, true, mode, prevCaption, undefined, singleUserIdeas);
      setSingleCaptionOptions(opts);
      setSingleCaptionIdx(0);
      setSingleCaption(opts[0]);
      setPostUsedAICaption(true);
    }
    catch (err) { setSingleError("Couldn't generate caption — please try again"); showGlobalToast("Couldn't generate caption — please try again"); }
    finally { setSingleGenerating(false); }
  }
  async function toggleFavorite(itemId: string) {
    if (plan === "free") { openProGate("Favorites & Heart Filter"); return; }
    const current = mediaItems.find((m) => m.id === itemId);
    if (!current) return;
    const newVal = !current.isFavorite;
    setMediaItems((prev) => prev.map((m) => m.id === itemId ? { ...m, isFavorite: newVal } : m));
    try {
      await apiPatch(`/media/${itemId}/favorite`, {});
    } catch {
      setMediaItems((prev) => prev.map((m) => m.id === itemId ? { ...m, isFavorite: !newVal } : m));
      showGlobalToast("Couldn't update favorite — please try again");
    }
  }

  function handleCreatePostClick() {
    if (plan === "free" && monthPostCount >= limits.maxPostsPerMonth) {
      openProGate(`Monthly post limit — ${limits.maxPostsPerMonth} posts/month on Free`);
      return;
    }
    setCreatePostModal(true);
  }

  function showUpgradeGate(usedAICaption: boolean, usedAITagging: boolean, usedVideo: boolean, currentCount: number, proceed: () => void) {
    const reasons: string[] = [];
    if (currentCount >= limits.maxPostsPerMonth) reasons.push(`Monthly post limit reached (${limits.maxPostsPerMonth} posts/month on Free)`);
    if (usedAICaption) reasons.push("AI Caption Generation");
    if (usedAITagging) reasons.push("AI Auto-Tagging");
    if (usedVideo) reasons.push("Video in post");
    const canContinue = !usedAICaption && !usedAITagging && !usedVideo && currentCount < limits.maxPostsPerMonth;
    if (reasons.length > 0) {
      setUpgradeModalData({ reasons, canContinue, onContinue: proceed });
      setUpgradeModalOpen(true);
      return false;
    }
    return true;
  }

  async function handleApproveSinglePost() {
    if (!singlePostItem || approveLoading) return;
    const usedAITagging = !!(singlePostItem.tag && singlePostItem.tag !== "other");
    const usedVideo = isVideo(singlePostItem.dataUrl, singlePostItem.media_type);
    if (plan === "free") {
      let latestCount = monthPostCount;
      try { const r = await apiGet<{ count: number }>("/posts/count"); latestCount = r.count ?? monthPostCount; } catch {}
      const canProceed = showUpgradeGate(postUsedAICaption, usedAITagging, usedVideo, latestCount, () => handleApproveSinglePost());
      if (!canProceed) return;
    }
    setApproveLoading(true);
    try {
      const finalCaption = singleCaption;
      const effectiveDate = singleScheduleDate || todayStr();
      const post: ApprovedPost = {
        id: generateId(), day: effectiveDate, caption: finalCaption,
        tagsSummary: tagIcon(singlePostItem.tag ?? "other"), slideCount: 1,
        scheduledDate: effectiveDate, scheduledTime: singleScheduleTime || appSettings.defaultScheduleTime,
        mediaIds: [singlePostItem.id], createdAt: new Date().toISOString(),
        timezone: userTimezone,
        usedAICaption: postUsedAICaption, usedAITagging, usedVideo,
      };
      setApprovedPosts((prev) => [post, ...prev]);
      setMonthPostCount((c) => c + 1);
      setPostUsedAICaption(false);
      await markItemsUsed([singlePostItem.id]);
      setSinglePostItem(null);
      try { await apiPost("/posts", post); } catch (err: any) {
        if (err?.status === 409 || (err instanceof Error && err.message.includes("duplicate_media"))) {
          setApprovedPosts((prev) => prev.filter((p) => p.id !== post.id));
          setMonthPostCount((c) => Math.max(0, c - 1));
          showGlobalToast("⚠️ Duplicate media — disable 'Prevent duplicates' in Settings");
          return;
        }
        showGlobalToast("Couldn't save post — please try again");
      }
      goToScreen("calendar");
    } finally {
      setApproveLoading(false);
    }
  }

  // ── Caption – 3-option system ──
  async function handleGetCaptionOptions(mode: "fresh" | "variations") {
    if (!carouselItems.length) return;
    if (!limits.aiCaptions) {
      setUpgradeModalData({ reasons: ["AI Caption Generation"], canContinue: false, onContinue: () => {} });
      setUpgradeModalOpen(true);
      return;
    }
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
      setPostUsedAICaption(true);
    } catch (err) { if (generationIdRef.current === thisGen) { setCaptionError("Couldn't generate caption — please try again"); showGlobalToast("Couldn't generate caption — please try again"); } }
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
    if (approveLoading) return;
    const usedAITagging = carouselItems.some((i) => i.tag && i.tag !== "other");
    const usedVideo = carouselItems.some((i) => isVideo(i.dataUrl, i.media_type));
    if (plan === "free" && !editingPost) {
      let latestCount = monthPostCount;
      try { const r = await apiGet<{ count: number }>("/posts/count"); latestCount = r.count ?? monthPostCount; } catch {}
      const canProceed = showUpgradeGate(postUsedAICaption, usedAITagging, usedVideo, latestCount, () => handleApproveCarousel());
      if (!canProceed) return;
    }
    setApproveLoading(true);
    try {
      const finalCaption = carouselCaption;
      const tags = carouselItems.map((i) => i.tag ?? "other");
      const effectiveDate = scheduleDate || todayStr();
      const postId = editingPost ? editingPost.id : generateId();
      const post: ApprovedPost = {
        id: postId, day: effectiveDate, caption: finalCaption,
        tagsSummary: [...new Set(tags)].map(tagIcon).join(" "),
        slideCount: carouselItems.length, scheduledDate: effectiveDate,
        scheduledTime: scheduleTime || appSettings.defaultScheduleTime,
        mediaIds: carouselIds, createdAt: new Date().toISOString(),
        timezone: userTimezone,
        usedAICaption: postUsedAICaption, usedAITagging, usedVideo,
      };
      if (editingPost) {
        const remaining = approvedPosts.filter((p) => p.id !== editingPost.id);
        await Promise.all([
          reconcileAfterDelete(remaining, mediaItems),
          markItemsUsed(carouselIds),
        ]);
        setApprovedPosts((prev) => prev.map((p) => p.id === editingPost.id ? post : p));
        try { await apiPut(`/posts/${editingPost.id}`, post); } catch (err: any) {
          if (err?.status === 409 || (err instanceof Error && err.message.includes("duplicate_media"))) {
            showGlobalToast("⚠️ Duplicate media — disable 'Prevent duplicates' in Settings");
            return;
          }
          showGlobalToast("Couldn't save post — please try again");
        }
      } else {
        await markItemsUsed(carouselIds);
        setApprovedPosts((prev) => [post, ...prev]);
        setMonthPostCount((c) => c + 1);
        setPostUsedAICaption(false);
        try { await apiPost("/posts", post); } catch (err: any) {
          if (err?.status === 409 || (err instanceof Error && err.message.includes("duplicate_media"))) {
            setApprovedPosts((prev) => prev.filter((p) => p.id !== post.id));
            setMonthPostCount((c) => Math.max(0, c - 1));
            showGlobalToast("⚠️ Duplicate media — disable 'Prevent duplicates' in Settings");
            return;
          }
          showGlobalToast("Couldn't save post — please try again");
        }
      }
      setCarouselIds([]); setCarouselCaption(""); setCaptionOptions(null); setCaptionSelectedIdx(null);
      setEditingPost(null);
      setScreen("calendar");
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (draftLoading) return;
    // BUG1: Free plan draft limit
    if (plan === "free" && !editingPost && draftPosts.length >= 3) {
      setUpgradeModalData({ reasons: ["You've reached the 3 draft limit on Free plan. Upgrade to Pro for unlimited drafts."], canContinue: false, onContinue: () => {} });
      setUpgradeModalOpen(true);
      return;
    }
    setDraftLoading(true);
    try {
      const finalCaption = carouselCaption ?? "";
      const tags = carouselItems.map((i) => i.tag ?? "other");
      const postId = editingPost ? editingPost.id : generateId();
      const draft: ApprovedPost = {
        id: postId, day: scheduleDate || todayStr(), caption: finalCaption,
        tagsSummary: [...new Set(tags)].map(tagIcon).join(" "),
        slideCount: carouselItems.length,
        scheduledDate: scheduleDate || null,
        scheduledTime: scheduleTime || null,
        mediaIds: carouselIds,
        status: "draft",
        createdAt: new Date().toISOString(),
        timezone: userTimezone,
      };
      if (editingPost) {
        setApprovedPosts((prev) => prev.map((p) => p.id === editingPost.id ? draft : p));
        try { await apiPut(`/posts/${editingPost.id}`, draft); } catch (err: any) {
          if (err?.status === 409 || (err instanceof Error && err.message.includes("duplicate_media"))) {
            showGlobalToast("⚠️ Duplicate media — disable 'Prevent duplicates' in Settings");
            return;
          }
        }
      } else {
        setApprovedPosts((prev) => [draft, ...prev]);
        try { await apiPost("/posts", draft); } catch (err: any) {
          if (err?.status === 409 || (err instanceof Error && err.message.includes("duplicate_media"))) {
            setApprovedPosts((prev) => prev.filter((p) => p.id !== draft.id));
            showGlobalToast("⚠️ Duplicate media — disable 'Prevent duplicates' in Settings");
            return;
          }
        }
      }
      setCarouselIds([]); setCarouselCaption(""); setCaptionOptions(null); setCaptionSelectedIdx(null);
      setEditingPost(null); setTodayBuildMode(false);
      setScreen("calendar");
    } finally {
      setDraftLoading(false);
    }
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
        // BUG2: Pro/Agency with preferred tags — filter by tags first, then fill with recent
        const usedIds = preventDuplicates && plan !== "free"
          ? new Set(approvedPosts.filter((ap) => ap.status === "draft" || ap.status === "scheduled").flatMap((ap) => ap.mediaIds ?? []))
          : new Set<string>();
        const pool = p.filter((m) => !usedIds.has(m.id));
        if (plan !== "free" && appSettings.preferredTags.length > 0) {
          const preferred = pool.filter((m) => m.tag && appSettings.preferredTags.includes(m.tag)).sort((a, b) => (b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1);
          const others = pool.filter((m) => !m.tag || !appSettings.preferredTags.includes(m.tag)).sort((a, b) => (b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1);
          picked = [...preferred, ...others].slice(0, targetCount);
          if (usedIds.size > 0 && pool.length < p.length) showGlobalToast("Some media was skipped — already used in other posts");
        } else {
          picked = [...pool].sort((a, b) => (a.createdAt ?? "") > (b.createdAt ?? "") ? -1 : 1).slice(0, targetCount);
        }
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
    } catch (err) { setAiError(err instanceof Error ? err.message : "AI error"); }
    finally { setAiGenerating(false); }
  }

  async function handleAIGenerateSingle() {
    setPlusMenuOpen(false); setAiError(null); setAiGenerating(true);
    try {
      // BUG2: filter out already-used media when preventDuplicates is ON for Pro
      const usedIds = preventDuplicates && plan !== "free"
        ? new Set(approvedPosts.filter((p) => p.status === "draft" || p.status === "scheduled").flatMap((p) => p.mediaIds ?? []))
        : new Set<string>();
      let p = mediaItems.filter((m) => m.tag && !m.analyzing && !m.used && !usedIds.has(m.id));
      let best: MediaItem | undefined;
      if (plan !== "free" && appSettings.preferredTags.length > 0) {
        // Pro/Agency: preferred tags first, fall back to most recent
        best = p.find((m) => m.tag === "me" && appSettings.preferredTags.includes("me"))
          ?? p.find((m) => m.tag && appSettings.preferredTags.includes(m.tag))
          ?? [...p].sort((a, b) => (b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1)[0];
      } else {
        // Free or no preferred tags: most recent tagged unused
        best = [...p].sort((a, b) => (b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1)[0];
      }
      if (!best) { setAiError("No tagged unused media."); setAiGenerating(false); return; }
      setSinglePostItem(best); setSingleEditing(false); setSingleError(null);
      setSingleScheduleDate(todayStr()); setSingleScheduleTime(nowTimeStr());
      setSingleCaptionOptions(null); setSingleCaptionIdx(null); setSingleCaptionOptionsExpanded(false);
      setSingleCaption("");
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
    // Decrement monthly counter if this post's scheduled slot is in the current month
    const now = new Date();
    const postDate = post.scheduledDate
      ? new Date(post.scheduledDate + "T12:00:00")
      : new Date(post.createdAt);
    if (postDate.getFullYear() === now.getFullYear() && postDate.getMonth() === now.getMonth()) {
      setMonthPostCount((c) => Math.max(0, c - 1));
    }
    try { await apiDelete(`/posts/${post.id}`); } catch {}
    await reconcileAfterDelete(remaining, mediaItems);
    // If we deleted the post we were editing, clear state and navigate away
    if (editingPost?.id === post.id) {
      setEditingPost(null);
      setCarouselIds([]); setCarouselCaption(""); setCaptionOptions(null); setCaptionSelectedIdx(null);
      setIsEditingCaption(false); setTodayBuildMode(false);
      goToScreen("calendar");
    }
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

  // ─── Auth gates ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[hsl(220,14%,8%)] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[hsl(263,70%,65%)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[hsl(220,14%,8%)] text-[hsl(220,10%,95%)] font-sans">
      {/* Global toast */}
      {globalToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-[hsl(220,14%,20%)] text-white text-sm px-5 py-3 rounded-2xl shadow-2xl border border-[hsl(220,13%,30%)] max-w-xs text-center pointer-events-none">
          {globalToast}
        </div>
      )}

      {/* ── ONBOARDING OVERLAY ── */}
      {session && onboardingComplete === false && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-[hsl(220,14%,8%)]">
          {/* Skip button */}
          <div className="flex justify-end px-5 pt-5">
            <button onClick={completeOnboarding} className="text-sm text-[hsl(220,10%,45%)] hover:text-white transition-colors">Skip</button>
          </div>
          {/* Step content */}
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            {onboardingStep === 1 && (
              <>
                <div className="text-7xl mb-6">👋</div>
                <h1 className="text-2xl font-bold mb-2">Welcome to InstaFlow</h1>
                <p className="text-[hsl(263,70%,70%)] text-sm mb-3">Your Instagram content workflow</p>
                <p className="text-[hsl(220,10%,55%)] text-sm leading-relaxed">Manage your media, create posts, and schedule them — all in one place.</p>
              </>
            )}
            {onboardingStep === 2 && (
              <>
                <div className="text-7xl mb-6">🖼️</div>
                <h1 className="text-2xl font-bold mb-2">Your Media Pool</h1>
                <p className="text-[hsl(220,10%,55%)] text-sm leading-relaxed mb-6">Upload your photos and videos. AI automatically tags and organizes them for you.</p>
                <div className="w-full max-w-xs bg-[hsl(220,14%,12%)] border border-[hsl(220,13%,20%)] rounded-2xl p-4">
                  <div className="grid grid-cols-3 gap-2">
                    {["🌅","🤳","🍕","🎵","🌿","👫"].map((e, i) => (
                      <div key={i} className="aspect-square rounded-xl bg-[hsl(220,14%,18%)] flex items-center justify-center text-2xl">{e}</div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {onboardingStep === 3 && (
              <>
                <div className="text-7xl mb-6">📅</div>
                <h1 className="text-2xl font-bold mb-2">Schedule & Post</h1>
                <p className="text-[hsl(220,10%,55%)] text-sm leading-relaxed mb-6">Create single posts or carousels, generate AI captions, and schedule them for the perfect time.</p>
                <div className="w-full max-w-xs bg-[hsl(220,14%,12%)] border border-[hsl(220,13%,20%)] rounded-2xl p-4 space-y-2">
                  {[{ label: "Mon 14", emoji: "📸", tag: "Carousel · 6 slides" }, { label: "Wed 16", emoji: "🖼️", tag: "Single post" }, { label: "Fri 18", emoji: "📸", tag: "Carousel · 4 slides" }].map(({ label, emoji, tag }) => (
                    <div key={label} className="flex items-center gap-3 p-2 rounded-xl bg-[hsl(220,14%,18%)]">
                      <span className="text-xl">{emoji}</span>
                      <div className="text-left">
                        <p className="text-xs font-medium text-[hsl(220,10%,85%)]">{label}</p>
                        <p className="text-[10px] text-[hsl(220,10%,45%)]">{tag}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Progress dots + CTA */}
          <div className="px-8 pb-12 space-y-5">
            <div className="flex justify-center gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`rounded-full transition-all ${onboardingStep === s ? "w-5 h-2 bg-[hsl(263,70%,65%)]" : "w-2 h-2 bg-[hsl(220,13%,28%)]"}`} />
              ))}
            </div>
            <button
              onClick={() => {
                if (onboardingStep < 3) { setOnboardingStep((s) => s + 1); }
                else { completeOnboarding(); }
              }}
              className="w-full py-4 rounded-2xl bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white font-semibold text-base transition-colors">
              {onboardingStep < 3 ? "Next →" : "Get Started 🚀"}
            </button>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav className={`border-b ${border} px-4 py-2.5 grid grid-cols-3 items-center sticky top-0 z-20 bg-[hsl(220,14%,8%)]`}>
        <div className="flex flex-col leading-tight tracking-tight font-bold">
          <span className="text-sm">Insta</span>
          <span className="text-sm">Flow</span>
        </div>
        <div className="flex items-center justify-center gap-0.5">
          {(["pool", "carousel", "calendar"] as Screen[]).map((s) => (
            <button key={s} onClick={() => goToScreen(s)}
              className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${screen === s ? activeNavCls : `${dimText} hover:text-[hsl(220,10%,80%)] hover:bg-[hsl(220,14%,14%)]`}`}>
              {s === "pool" ? "🗂 Pool" : s === "carousel" ? "📸 Today" : "📅 Cal"}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3">
          {/* Profile icon button */}
          <button onClick={() => { setProfileDrawerOpen(true); setPlusMenuOpen(false); }}
            className={`flex items-center justify-center transition-colors ${profileDrawerOpen || profileSubpage ? "text-[hsl(263,70%,70%)]" : "text-[hsl(220,10%,55%)] hover:text-[hsl(220,10%,85%)]"}`}>
            <CircleUserRound className="w-6 h-6" strokeWidth={1.75} />
          </button>
          <div className="relative">
            <button onClick={() => { setPlusMenuOpen((o) => !o); cancelSelection(); }}
              className={`relative w-8 h-8 rounded-lg bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white font-bold text-lg flex items-center justify-center ${aiGenerating ? "animate-pulse" : ""}`}>
              {plusMenuOpen ? "✕" : aiGenerating ? "…" : "+"}
              {dailyBadge && !plusMenuOpen && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-[hsl(220,14%,8%)]" />}
            </button>
            {plusMenuOpen && (
              <div className={`absolute right-0 top-10 w-60 rounded-xl border ${border} bg-[hsl(220,14%,12%)] shadow-xl overflow-hidden z-30`}>
                {[
                  { icon: "🖼️", label: "Single Post", sub: "Select 1 image", action: () => { setPlusMenuOpen(false); goToScreen("pool"); enterSelectionMode("single"); } },
                  { icon: "📸", label: "Carousel", sub: "Select 2–20 items", action: () => { setPlusMenuOpen(false); goToScreen("pool"); enterSelectionMode("carousel"); } },
                  { icon: "✨", label: "AI Generate Single", sub: "AI picks best image", action: handleAIGenerateSingle },
                  { icon: "🤖", label: "AI Generate Carousel", sub: "Rule-based or by theme", action: () => { setPlusMenuOpen(false); setAiTypeModal(true); } },
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

      {isOffline && (
        <div className="bg-amber-500/10 border-b border-amber-500/25 px-4 py-2 flex items-center gap-2">
          <span className="text-amber-400 text-sm flex-shrink-0">📡</span>
          <p className="text-sm text-amber-300 flex-1">You're offline — some features may not work</p>
        </div>
      )}
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
                  <button onClick={() => fileInputRef.current?.click()} className={`${mutedBtn} flex flex-row items-center gap-1 whitespace-nowrap`}>
                    <span>+ Upload</span>{plan === "free" && mediaTotal >= limits.maxMedia && <DiamondBadge />}
                  </button>
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
                      <button onClick={() => {
                        if (plan === "free") { openProGate("Filter by Tag"); return; }
                        setFilterDropdownOpen((o) => !o); setSortDropdownOpen(false);
                      }}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${activeFilters.length > 0 ? activeNavCls : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                        🏷️ {activeFilters.length > 0 ? `Filtered (${activeFilters.length})` : "Filter by Tag"}{plan === "free" && <DiamondBadge />} ▾
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
                    <button onClick={() => {
                        if (plan === "free") { openProGate("Favorites & Heart Filter"); return; }
                        setFilterFavoritesOnly((v) => !v); setFilterDropdownOpen(false);
                      }}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${filterFavoritesOnly ? "bg-red-500/15 text-red-300 border-red-500/30" : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                      <Heart className="w-4 h-4" stroke={filterFavoritesOnly ? "#ef4444" : "currentColor"} fill={filterFavoritesOnly ? "#ef4444" : "none"} />{plan === "free" && <DiamondBadge />}
                    </button>
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
                  <button onClick={() => { setOpenFolder(null); setFolderAddMode(false); cancelBulkMode(); }} className={`${dimText} hover:text-white text-sm`}>← Back</button>
                  <span className="text-sm font-semibold">📁 {openFolder.name}</span>
                  <span className={`text-xs ${dimText}`}>({openFolder.mediaIds.filter((id) => mediaMap[id]).length})</span>
                </div>
                <div className="flex items-center gap-2">
                  {folderAddMode ? (
                    <button onClick={() => setFolderAddMode(false)} className={`text-xs px-2.5 py-1 rounded-lg bg-[hsl(263,70%,65%)/20] text-[hsl(263,70%,75%)] border border-[hsl(263,70%,65%)/30]`}>Done Adding</button>
                  ) : bulkMode ? (
                    <button onClick={cancelBulkMode} className={`text-xs px-3 py-1.5 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] transition-colors`}>Cancel</button>
                  ) : (
                    <>
                      <button onClick={() => { setBulkMode(true); setBulkSelectedIds([]); }} className={`text-xs px-3 py-1.5 rounded-lg border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] transition-colors`}>Select</button>
                      <button onClick={() => setConfirmDeleteFolder(true)} className={`text-xs ${dimText} hover:text-red-400`}>Delete folder</button>
                    </>
                  )}
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
              <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                <span className="text-6xl">📷</span>
                <div>
                  <p className="font-semibold text-[hsl(220,10%,80%)] text-lg">No media yet</p>
                  <p className={`text-sm ${dimText} mt-1`}>Upload your first photo or video to get started</p>
                </div>
                <button onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 rounded-xl bg-[hsl(263,70%,65%)] text-white text-sm font-semibold hover:bg-[hsl(263,70%,58%)] transition-colors">
                  + Upload
                </button>
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
                            <div key={item.id} className="relative rounded-lg overflow-hidden aspect-square opacity-75 cursor-pointer active:opacity-50" onClick={() => { setUsedViewerItem(item); setUsedViewerPost(post ?? null); setUsedViewerRemoveConfirm(false); }}>
                              {isVideo(item.dataUrl, item.media_type) ? <>{(videoPosters[item.id] || item.thumbnail_url) ? <img src={videoPosters[item.id] || item.thumbnail_url!} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center text-xl">🎥</div>}<span className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center text-white text-[9px]">▶</span></span></> : brokenImages.has(item.id) ? <div className="w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center text-2xl">{tagIcon(item.tag ?? "other")}</div> : <img src={item.dataUrl} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={() => setBrokenImages((p) => new Set([...p, item.id]))} />}
                              {item.tag && <span style={{ transform: "translateZ(0)" }} className={`absolute top-0.5 left-0.5 text-[8px] px-1 py-0.5 rounded ${tagColor(item.tag, appSettings.customTags)}`}>{tagIcon(item.tag)}</span>}
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
                              {isVideo(imgs[2].dataUrl, imgs[2].media_type)
                                ? (imgs[2].thumbnail_url || videoPosters[imgs[2].id] ? <img src={imgs[2].thumbnail_url || videoPosters[imgs[2].id]} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center text-xl">🎥</div>)
                                : <img src={imgs[2].dataUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
                            </div>
                          )}
                          {imgs[1] && (
                            <div className="absolute inset-0 rounded-xl overflow-hidden border border-[hsl(220,13%,25%)]"
                              style={{ transform: "rotate(-3.5deg) scale(0.96)", zIndex: 2, opacity: 0.88 }}>
                              {isVideo(imgs[1].dataUrl, imgs[1].media_type)
                                ? (imgs[1].thumbnail_url || videoPosters[imgs[1].id] ? <img src={imgs[1].thumbnail_url || videoPosters[imgs[1].id]} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center text-xl">🎥</div>)
                                : <img src={imgs[1].dataUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
                            </div>
                          )}
                          <div className="absolute inset-0 rounded-xl overflow-hidden border-2 border-[hsl(220,13%,28%)] group-hover:border-[hsl(263,70%,65%)/60] transition-all"
                            style={{ zIndex: 3 }}>
                            {imgs[0]
                              ? (isVideo(imgs[0].dataUrl, imgs[0].media_type)
                                  ? (imgs[0].thumbnail_url || videoPosters[imgs[0].id] ? <img src={imgs[0].thumbnail_url || videoPosters[imgs[0].id]} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[hsl(220,14%,16%)] flex items-center justify-center text-xl">🎥</div>)
                                  : <img src={imgs[0].dataUrl} alt="" loading="lazy" className="w-full h-full object-cover" />)
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
                    <button onClick={() => {
                      if (plan === "free" && folders.length >= limits.maxFolders) {
                        setUpgradeModalData({ reasons: [`Folder limit (${limits.maxFolders} folder on Free)`], canContinue: false, onContinue: () => {} });
                        setUpgradeModalOpen(true);
                      } else {
                        setCreateFolderOpen(true);
                      }
                    }}
                      className={`text-xs flex items-center gap-1 px-2.5 py-1 rounded-lg border ${border} ${dimText} hover:text-white hover:border-[hsl(263,70%,65%)/40] transition-colors`}>
                      📁 + New Folder{plan === "free" && folders.length >= limits.maxFolders && <DiamondBadge />}
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
                    <div className="col-span-3 flex flex-col items-center justify-center py-16 gap-3 text-center">
                      <span className="text-4xl">🔍</span>
                      <div>
                        <p className={`text-sm font-medium text-[hsl(220,10%,70%)]`}>No results found</p>
                        <p className={`text-xs ${dimText} mt-1`}>Try different filters or tags</p>
                      </div>
                      <button onClick={() => { setActiveFilters([]); setPoolSort("latest"); }}
                        className={`text-xs px-3 py-1.5 rounded-lg border ${border} ${dimText} hover:text-white hover:border-[hsl(263,70%,65%)/40] transition-colors`}>
                        Clear filters
                      </button>
                    </div>
                  );
                  if (displayItems.length === 0 && openFolder && folderAddMode) return (
                    <div className={`col-span-3 text-center py-8 ${dimText} text-sm`}>
                      <p>All pool items are already in this folder.</p>
                    </div>
                  );
                  if (displayItems.length === 0 && openFolder) return (
                    <div className="col-span-3 flex flex-col items-center justify-center py-14 gap-3 text-center">
                      <span className="text-4xl">📂</span>
                      <div>
                        <p className={`text-sm font-medium text-[hsl(220,10%,70%)]`}>This folder is empty</p>
                        <p className={`text-xs ${dimText} mt-1`}>Add photos or videos to this folder</p>
                      </div>
                      <button onClick={() => setFolderAddSourceSheet(true)}
                        className={`text-xs px-3 py-1.5 rounded-lg border ${border} ${dimText} hover:text-white hover:border-[hsl(263,70%,65%)/40] transition-colors`}>
                        + Add File(s)
                      </button>
                    </div>
                  );
                  const mappedItems = displayItems.map((item) => {
                    const isSelected = selectionMode ? selectedIds.includes(item.id) : bulkMode ? bulkSelectedIds.includes(item.id) : false;
                    return (
                      <div key={item.id}
                        onPointerDown={(e) => {
                          if (bulkMode) { setIsDragSelecting(true); setBulkSelectedIds((prev) => prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]); return; }
                          clearLongPress(); startPoolLongPress(item, e, !!(openFolder && !folderAddMode));
                        }}
                        onPointerEnter={() => { if (isDragSelecting && bulkMode) setBulkSelectedIds((prev) => prev.includes(item.id) ? prev : [...prev, item.id]); }}
                        onPointerMove={checkLongPressMove}
                        onPointerUp={(e) => { setIsDragSelecting(false); clearLongPress(); }}
                        onPointerCancel={() => { setIsDragSelecting(false); clearLongPress(); }}
                        onClick={(e) => {
                          if (longPressFired.current) { longPressFired.current = false; return; }
                          if (bulkMode) { e.stopPropagation(); return; }
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
                        style={{ position: "relative", paddingBottom: "100%" }}
                        className={`rounded-xl overflow-hidden cursor-pointer transition-all select-none
                          ${(selectionMode && isSelected) || (bulkMode && isSelected) ? "ring-2 ring-[hsl(263,70%,65%)]" : ""}
                          ${(openFolder && folderAddMode && folderPendingIds.includes(item.id)) ? "ring-2 ring-emerald-400" : ""}
                          ${bulkMode && !isSelected ? "opacity-70" : ""}`}>
                        <div style={{ position: "absolute", inset: 0 }}>
                        {isVideo(item.dataUrl, item.media_type)
                          ? <div style={{ width: "100%", height: "100%", position: "relative" }}>{(videoPosters[item.id] || item.thumbnail_url) ? <img src={videoPosters[item.id] || item.thumbnail_url!} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "hsl(220,14%,16%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎥</div>}<span className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white text-sm">▶</span></span>{item.duration ? <span className="absolute bottom-1 right-1 text-[9px] text-white bg-black/60 rounded px-1 leading-4">{fmtDuration(item.duration)}</span> : null}</div>
                          : brokenImages.has(item.id) ? <div style={{ width: "100%", height: "100%", background: "hsl(220,14%,16%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{tagIcon(item.tag ?? "other")}</div> : <LazyImg src={item.dataUrl} alt={item.name} className="object-cover" style={{ width: "100%", height: "100%" }} onError={() => setBrokenImages((p) => new Set([...p, item.id]))} />}
                        {item.analyzing && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><span className="text-xs text-white animate-pulse">Analyzing…</span></div>}
                        {!item.analyzing && !bulkMode && !folderAddMode && (
                          <button onClick={(e) => { e.stopPropagation(); setTagPickerItem(item); }}
                            className={`absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded border backdrop-blur-sm ${item.tag ? tagColor(item.tag, appSettings.customTags) : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"}`}>
                            {item.tag ? (
                              <>{tagIcon(item.tag)}{plan === "free" && item.tag === "other" && <span className="ml-0.5 text-[hsl(263,70%,65%)]">💎</span>}</>
                            ) : "＋ Tag"}
                          </button>
                        )}
                        {!item.analyzing && !bulkMode && !folderAddMode && !selectionMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
                            style={{ top: 6, right: 6, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.7))" }}
                            className="absolute flex items-center justify-center">
                            <Heart className="w-4 h-4" stroke={item.isFavorite ? "#ef4444" : "white"} fill={item.isFavorite ? "#ef4444" : "none"} />
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
                      </div>
                    );
                  });
                  return (
                    <>
                      {mappedItems}
                      {openFolder && !folderAddMode && !bulkMode && !selectionMode && (
                        <button
                          key="add-file-tile"
                          onClick={() => setFolderAddSourceSheet(true)}
                          className="aspect-square rounded-xl border-2 border-dashed border-[hsl(220,13%,28%)] hover:border-[hsl(263,70%,65%)/60] flex flex-col items-center justify-center gap-1.5 text-[hsl(220,10%,40%)] hover:text-[hsl(263,70%,70%)] transition-colors cursor-pointer">
                          <span className="text-2xl leading-none">+</span>
                          <span className="text-[10px] font-medium">Add File(s)</span>
                        </button>
                      )}
                    </>
                  );
                })()}
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
                  </div>

                  {/* Post counter — Free plan only */}
                  {plan === "free" && (
                    <div className={`flex items-center justify-between text-xs px-0.5`}>
                      <span className={monthPostCount >= limits.maxPostsPerMonth ? "text-red-400 font-medium" : dimText}>
                        {monthPostCount} / {limits.maxPostsPerMonth} posts scheduled this month
                      </span>
                      {monthPostCount >= limits.maxPostsPerMonth && (
                        <span className="text-red-400 font-medium">Limit reached</span>
                      )}
                    </div>
                  )}

                  {todayPosts.length === 0 ? (
                    /* Empty state — large centered "+" */
                    <button
                      onClick={handleCreatePostClick}
                      className={`w-full ${card} flex flex-col items-center justify-center gap-3 py-16 hover:bg-[hsl(220,14%,14%)] transition-colors group`}>
                      <div className="w-16 h-16 rounded-full border-2 border-dashed border-[hsl(263,70%,65%)/50] group-hover:border-[hsl(263,70%,65%)] flex items-center justify-center transition-colors">
                        <span className="text-3xl font-light text-[hsl(263,70%,65%)]">+</span>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-[hsl(220,10%,85%)] flex items-center justify-center gap-1">
                          Create Post{plan === "free" && monthPostCount >= limits.maxPostsPerMonth && <DiamondBadge />}
                        </p>
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
                          <div key={post.id} onClick={() => { setPreviewPost(post); setPreviewSlide(0); }} className={`${card} border ${sc.card} overflow-hidden cursor-pointer hover:border-[hsl(263,70%,65%)/40] transition-colors`}>
                            <div className="flex items-stretch">
                              {thumb && (
                                <div className="w-20 flex-shrink-0 overflow-hidden relative">
                                  {isVideo(thumb.dataUrl)
                                    ? <>{videoPosters[thumb.id] ? <LazyImg src={videoPosters[thumb.id]} alt="" className="object-cover" /> : <div className="w-full h-full bg-[hsl(220,14%,16%)]" />}<span className="absolute inset-0 flex items-center justify-center"><span className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white text-xs">▶</span></span></>
                                    : <LazyImg src={thumb.dataUrl} alt="" className="object-cover" />}
                                </div>
                              )}
                              <div className="flex-1 p-4 space-y-2 min-w-0">
                                {/* Row 1: type + status dot */}
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                                  <span className={`text-xs ${dimText}`}>{post.slideCount === 1 ? "Single" : `${post.slideCount} slides`}</span>
                                </div>
                                {/* Row 2: tags + video pill + scheduled time */}
                                {(post.tagsSummary || post.scheduledTime || post.mediaIds?.some((id) => { const m = mediaItems.find((x) => x.id === id); return m && isVideo(m.dataUrl, m.media_type); })) && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {post.tagsSummary ? <span className="text-base leading-none">{post.tagsSummary}</span> : null}
                                    {post.mediaIds?.some((id) => { const m = mediaItems.find((x) => x.id === id); return m && isVideo(m.dataUrl, m.media_type); }) && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(220,14%,22%)] text-white/70 border border-[hsl(220,13%,30%)]">▶ Video</span>
                                    )}
                                    {post.scheduledTime && <span className="text-[10px] text-[hsl(220,10%,40%)] flex-shrink-0 ml-auto">🕐 {post.scheduledTime}</span>}
                                  </div>
                                )}
                                {/* Row 3: caption */}
                                {post.caption && <p className={`text-xs ${dimText} leading-relaxed`}>{post.caption}</p>}
                                {/* Row 4: status badge + edit/delete */}
                                <div className="flex items-center justify-between pt-0.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full border ${sc.badge}`}>
                                    {getPostStatus(post) === "scheduled" ? "🕐 Scheduled" : "✓ Posted"}
                                  </span>
                                  <div className="flex gap-3 items-center">
                                    {post.mediaIds?.length ? <button onClick={(e) => { e.stopPropagation(); openPostForEdit(post); }} className={`text-xs ${dimText} hover:text-[hsl(263,70%,70%)]`}>✏️ Edit</button> : null}
                                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmPost(post); }} className={`text-xs ${dimText} hover:text-red-400`}>🗑️ Delete</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Smaller "Create Post" below existing posts */}
                      <button
                        onClick={handleCreatePostClick}
                        className={`w-full py-3 rounded-xl border border-dashed ${border} ${dimText} hover:border-[hsl(263,70%,65%)/50] hover:text-[hsl(263,70%,70%)] transition-colors flex items-center justify-center gap-2 text-sm font-medium`}>
                        <span className="text-base">+</span> Create Post{plan === "free" && monthPostCount >= limits.maxPostsPerMonth && <DiamondBadge />}
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
                    {isVideo(currentSlide.dataUrl, currentSlide.media_type) ? (
                      <video
                        key={currentSlide.id}
                        src={currentSlide.dataUrl}
                        poster={currentSlide.thumbnail_url || (videoPosters[currentSlide.id] ?? undefined)}
                        className="w-full h-full object-cover"
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        controls
                        controlsList="nodownload nofullscreen"
                        data-slide
                        style={{ display: "block" }}
                      />
                    ) : <img src={currentSlide.dataUrl} alt="" className="w-full h-full object-cover" />}
                    {currentSlide.tag && <span className={`absolute top-3 left-3 text-xs px-2 py-0.5 rounded-lg border backdrop-blur-sm ${tagColor(currentSlide.tag, appSettings.customTags)} flex items-center gap-1`}>{tagIcon(currentSlide.tag)} {tagLabel(currentSlide.tag)}{plan === "free" && currentSlide.tag === "other" && <span className="text-[hsl(263,70%,75%)]">💎</span>}</span>}
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
                onWheel={(e) => {
                  if (!filmstripRef.current) return;
                  filmstripRef.current.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
                }}
                onTouchStart={(e) => {
                  if (filmDragFrom !== null) return;
                  touchScrollRef.current = { startX: e.touches[0].clientX, startScrollLeft: filmstripRef.current?.scrollLeft ?? 0, active: true };
                }}
                onTouchMove={(e) => {
                  const ts = touchScrollRef.current;
                  if (!ts.active || filmDragFrom !== null || !filmstripRef.current) return;
                  e.stopPropagation();
                  filmstripRef.current.scrollLeft = ts.startScrollLeft + (ts.startX - e.touches[0].clientX);
                }}
                onTouchEnd={() => { touchScrollRef.current.active = false; }}
                onPointerMove={handleFilmPointerMove}
                onPointerUp={handleFilmPointerUp}
                onPointerCancel={handleFilmPointerCancel}
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
                      {isVideo(item.dataUrl, item.media_type)
                        ? <>{(videoPosters[item.id] || item.thumbnail_url) ? <img src={videoPosters[item.id] || item.thumbnail_url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /> : <div style={{ width: "100%", height: "100%", background: "hsl(220,14%,16%)" }} />}<span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 9 }}>▶</span></span></>
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
                    <span style={{ fontSize: 9, fontWeight: 500 }}>{carouselIds.length === 0 ? "Add slides" : "Add File(s)"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* 3. SELECTED CAPTION DISPLAY (Fix 6) */}
            {/* Caption card — unified textarea + generate + pills */}
            {carouselItems.length > 0 && (
              <div className={`${card} p-5 space-y-3`}>
                <span className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Caption</span>
                <textarea
                  ref={carouselCaptionRef}
                  value={carouselCaption}
                  onChange={(e) => setCarouselCaption(e.target.value)}
                  onInput={(e) => { e.currentTarget.style.height = "auto"; e.currentTarget.style.height = e.currentTarget.scrollHeight + "px"; }}
                  placeholder="Write your caption…"
                  rows={1}
                  style={{ resize: "none", overflow: "hidden", minHeight: 40 }}
                  className={`w-full bg-[hsl(220,14%,9%)] border ${carouselCaption ? "border-[hsl(263,70%,65%)/40]" : border} focus:border-[hsl(263,70%,65%)/60] rounded-xl px-3 py-2.5 text-sm text-[hsl(220,10%,85%)] focus:outline-none placeholder:text-[hsl(220,10%,35%)] transition-colors`}
                />
                <button
                  onClick={() => handleGetCaptionOptions("fresh")}
                  disabled={generatingCaptions}
                  className="w-full py-2.5 rounded-xl border border-dashed border-[hsl(263,70%,65%)/40] text-[hsl(263,70%,70%)] hover:bg-[hsl(263,70%,65%)/10] text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {generatingCaptions ? "✨ Generating…" : "✨ Generate 3 Captions"}{!limits.aiCaptions && <DiamondBadge />}
                </button>
                {generatingCaptions && (
                  <button onClick={cancelAIGeneration} className="w-full text-xs text-center text-red-400 hover:text-red-300 transition-colors">✕ Cancel generation</button>
                )}
                {captionError && (
                  <div className="flex items-center justify-between gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <span>⚠️ Couldn't generate captions. Please try again.</span>
                    <button onClick={() => handleGetCaptionOptions("fresh")} className="flex-shrink-0 px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium">↺ Try Again</button>
                  </div>
                )}
                {captionOptions && !generatingCaptions && (
                  <div className="space-y-2">
                    <p className={`text-[10px] ${dimText} uppercase tracking-wider font-medium`}>Tap a style to fill your caption:</p>
                    <div className="space-y-1.5">
                      {captionOptions.map((opt, i) => {
                        const labels = ["Minimal / cool", "Bold / confident", "Poetic / aesthetic"];
                        const selected = captionSelectedIdx === i;
                        return (
                          <button key={i} onClick={() => { setCaptionSelectedIdx(i); setCarouselCaption(opt); }}
                            className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${selected ? "border-[hsl(263,70%,65%)] bg-[hsl(263,70%,65%)/10]" : `border-[hsl(220,13%,22%)] hover:border-[hsl(220,13%,35%)] bg-[hsl(220,14%,9%)]`}`}>
                            <span className="text-[9px] font-semibold uppercase tracking-wider opacity-60 mr-1.5">{labels[i]}:</span>
                            <span className={`text-xs ${selected ? "text-[hsl(220,10%,90%)]" : dimText}`}>{opt.split('\n')[0].slice(0, 70)}{(opt.split('\n')[0].length > 70 || opt.includes('\n')) ? "…" : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-4 pt-0.5">
                      <button onClick={() => handleGetCaptionOptions("variations")} disabled={generatingCaptions}
                        className={`text-xs ${dimText} hover:text-white disabled:opacity-40 flex items-center gap-1`}>
                        ↺ Variations{!limits.aiCaptions && <DiamondBadge />}
                      </button>
                      <button onClick={() => handleGetCaptionOptions("fresh")} disabled={generatingCaptions}
                        className={`text-xs ${dimText} hover:text-white disabled:opacity-40 flex items-center gap-1`}>
                        🆕 New Caption{!limits.aiCaptions && <DiamondBadge />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Schedule + Approve */}
            {carouselItems.length > 0 && (
              <div className={`${card} p-5 space-y-3`}>
                <span className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Schedule</span>
                <div className="flex gap-3 flex-wrap">
                  <div className="flex flex-col gap-0.5">
                    <label className={`text-[10px] ${dimText}`}>Date</label>
                    <DatePicker value={scheduleDate} onChange={setScheduleDate} className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className={`text-[10px] ${dimText}`}>Time</label>
                    <TimePicker value={scheduleTime} onChange={setScheduleTime} className={inputCls} />
                  </div>
                </div>
                <button onClick={handleApproveCarousel}
                  disabled={approveLoading || !carouselCaption.trim() || !!(scheduleDate && scheduleTime && new Date(`${scheduleDate}T${scheduleTime}`) < new Date()) || (editingPost ? carouselItems.length < 1 : carouselItems.length < 2)}
                  className="w-full py-3 rounded-xl font-semibold bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white disabled:opacity-40 disabled:cursor-not-allowed">
                  {approveLoading ? "⏳ Saving…" : editingPost && editingPost.status !== "draft" ? "✓ Update Post" : "✓ Approve & Schedule"}
                </button>
                {!carouselCaption.trim() && <p className="text-[11px] text-amber-400/80 text-center -mt-1">Please add a caption before scheduling</p>}
                {carouselCaption.trim() && !!(scheduleDate && scheduleTime && new Date(`${scheduleDate}T${scheduleTime}`) < new Date()) && <p className="text-[11px] text-amber-400/80 text-center -mt-1">Please select a future date and time</p>}
                <button onClick={handleSaveDraft}
                  disabled={draftLoading || carouselItems.length === 0}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}>
                  {draftLoading ? "⏳ Saving…" : <>💾 Save as Draft{plan === "free" && !editingPost && draftPosts.length >= 3 && <DiamondBadge />}</>}
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
              <button onClick={() => attemptCancelSingle(cancelSinglePost)} className={mutedBtn}>Cancel</button>
            </div>

            {/* 1. MAIN VIEWER + BOTTOM ACTION BAR (same card as Carousel) */}
            <div className={`${card} overflow-hidden`}>
              {/* 4:5 viewer */}
              <div className="relative overflow-hidden rounded-t-xl" style={{ aspectRatio: "4/5" }}>
                {isVideo(singlePostItem.dataUrl, singlePostItem.media_type)
                  ? <video
                      key={singlePostItem.id}
                      src={singlePostItem.dataUrl}
                      poster={singlePostItem.thumbnail_url || (videoPosters[singlePostItem.id] ?? undefined)}
                      className="w-full h-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="auto"
                      controls
                      controlsList="nodownload nofullscreen"
                      style={{ display: "block" }}
                    />
                  : brokenImages.has(singlePostItem.id)
                    ? <div className="w-full h-full bg-[hsl(220,14%,9%)] flex items-center justify-center text-6xl">{tagIcon(singlePostItem.tag ?? "other")}</div>
                    : <img src={singlePostItem.dataUrl} alt="" className="w-full h-full object-cover" onError={() => setBrokenImages((p) => new Set([...p, singlePostItem!.id]))} />}
                {singlePostItem.tag && (
                  <span className={`absolute top-3 left-3 text-xs px-2 py-0.5 rounded-lg border backdrop-blur-sm flex items-center gap-1 ${tagColor(singlePostItem.tag, appSettings.customTags)}`}>
                    {tagIcon(singlePostItem.tag)} {tagLabel(singlePostItem.tag)}{plan === "free" && singlePostItem.tag === "other" && <span className="text-[hsl(263,70%,75%)]">💎</span>}
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
              <input ref={singleLibraryRef} type="file" accept={limits.videoUpload ? "image/*,video/mp4,video/quicktime,video/avi,video/webm,video/x-msvideo" : "image/*"} multiple className="hidden"
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

            {/* 3. CAPTION — unified textarea + generate + pills */}
            <div className={`${card} p-5 space-y-3`}>
              <span className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Caption</span>
              <textarea
                ref={singleCaptionRef}
                value={singleCaption}
                onChange={(e) => setSingleCaption(e.target.value)}
                onInput={(e) => { e.currentTarget.style.height = "auto"; e.currentTarget.style.height = e.currentTarget.scrollHeight + "px"; }}
                placeholder="Write your caption…"
                rows={1}
                style={{ resize: "none", overflow: "hidden", minHeight: 40 }}
                className={`w-full bg-[hsl(220,14%,9%)] border ${singleCaption ? "border-[hsl(263,70%,65%)/40]" : border} focus:border-[hsl(263,70%,65%)/60] rounded-xl px-3 py-2.5 text-sm text-[hsl(220,10%,85%)] focus:outline-none placeholder:text-[hsl(220,10%,35%)] transition-colors`}
              />
              <button
                onClick={() => handleGenerateSingleCaption("fresh")}
                disabled={singleGenerating}
                className="w-full py-2.5 rounded-xl border border-dashed border-[hsl(263,70%,65%)/40] text-[hsl(263,70%,70%)] hover:bg-[hsl(263,70%,65%)/10] text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {singleGenerating ? "✨ Generating…" : "✨ Generate 3 Captions"}{!limits.aiCaptions && <DiamondBadge />}
              </button>
              {singleError && (
                <div className="flex items-center justify-between gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <span>⚠️ {singleError}</span>
                  <button onClick={() => handleGenerateSingleCaption("fresh")} className="flex-shrink-0 px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium">↺ Try Again</button>
                </div>
              )}
              {singleCaptionOptions && !singleGenerating && (
                <div className="space-y-2">
                  <p className={`text-[10px] ${dimText} uppercase tracking-wider font-medium`}>Tap a style to fill your caption:</p>
                  <div className="space-y-1.5">
                    {singleCaptionOptions.map((opt, i) => {
                      const labels = ["Minimal / cool", "Bold / confident", "Poetic / aesthetic"];
                      const selected = singleCaptionIdx === i;
                      return (
                        <button key={i} onClick={() => { setSingleCaptionIdx(i); setSingleCaption(opt); }}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${selected ? "border-[hsl(263,70%,65%)] bg-[hsl(263,70%,65%)/10]" : `border-[hsl(220,13%,22%)] hover:border-[hsl(220,13%,35%)] bg-[hsl(220,14%,9%)]`}`}>
                          <span className="text-[9px] font-semibold uppercase tracking-wider opacity-60 mr-1.5">{labels[i]}:</span>
                          <span className={`text-xs ${selected ? "text-[hsl(220,10%,90%)]" : dimText}`}>{opt.split('\n')[0].slice(0, 70)}{(opt.split('\n')[0].length > 70 || opt.includes('\n')) ? "…" : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 pt-0.5">
                    <button onClick={() => handleGenerateSingleCaption("variations")} disabled={singleGenerating}
                      className={`text-xs ${dimText} hover:text-white disabled:opacity-40 flex items-center gap-1`}>
                      ↺ Variations{!limits.aiCaptions && <DiamondBadge />}
                    </button>
                    <button onClick={() => handleGenerateSingleCaption("fresh")} disabled={singleGenerating}
                      className={`text-xs ${dimText} hover:text-white disabled:opacity-40 flex items-center gap-1`}>
                      🆕 New Caption{!limits.aiCaptions && <DiamondBadge />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. SCHEDULE + APPROVE — mirrors Carousel */}
            <div className={`${card} p-5 space-y-3`}>
              <span className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Schedule</span>
              <div className="flex gap-3 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <label className={`text-[10px] ${dimText}`}>Date</label>
                  <DatePicker value={singleScheduleDate} onChange={setSingleScheduleDate} className={inputCls} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className={`text-[10px] ${dimText}`}>Time</label>
                  <TimePicker value={singleScheduleTime} onChange={setSingleScheduleTime} className={inputCls} />
                </div>
              </div>
              <button onClick={handleApproveSinglePost}
                disabled={approveLoading || !singleCaption.trim() || !!(singleScheduleDate && singleScheduleTime && new Date(`${singleScheduleDate}T${singleScheduleTime}`) < new Date())}
                className="w-full py-3 rounded-xl font-semibold bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white disabled:opacity-40 disabled:cursor-not-allowed">
                {approveLoading ? "⏳ Saving…" : "✓ Approve & Schedule"}
              </button>
              {!singleCaption.trim() && <p className="text-[11px] text-amber-400/80 text-center -mt-1">Please add a caption before scheduling</p>}
              {singleCaption.trim() && !!(singleScheduleDate && singleScheduleTime && new Date(`${singleScheduleDate}T${singleScheduleTime}`) < new Date()) && <p className="text-[11px] text-amber-400/80 text-center -mt-1">Please select a future date and time</p>}
              <button
                onClick={async () => {
                  if (!singlePostItem) return;
                  if (plan === "free" && draftPosts.length >= 3) {
                    setUpgradeModalData({ reasons: ["You've reached the 3 draft limit on Free plan. Upgrade to Pro for unlimited drafts."], canContinue: false, onContinue: () => {} });
                    setUpgradeModalOpen(true);
                    return;
                  }
                  const draft: ApprovedPost = {
                    id: generateId(), day: singleScheduleDate || todayStr(),
                    caption: singleCaption || "",
                    tagsSummary: tagIcon(singlePostItem.tag ?? "other"), slideCount: 1,
                    scheduledDate: singleScheduleDate || null,
                    scheduledTime: singleScheduleTime || null,
                    mediaIds: [singlePostItem.id],
                    status: "draft",
                    createdAt: new Date().toISOString(),
                  };
                  setApprovedPosts((prev) => [draft, ...prev]);
                  try { await apiPost("/posts", draft); } catch (err: any) {
                    if (err?.status === 409 || (err instanceof Error && err.message.includes("duplicate_media"))) {
                      setApprovedPosts((prev) => prev.filter((p) => p.id !== draft.id));
                      showGlobalToast("⚠️ Duplicate media — disable 'Prevent duplicates' in Settings");
                      return;
                    }
                  }
                  cancelSinglePost();
                  goToScreen("calendar");
                }}
                className={`w-full py-2.5 rounded-xl text-sm font-medium border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] transition-colors`}>
                💾 Save as Draft{plan === "free" && draftPosts.length >= 3 && <DiamondBadge />}
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
              <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                <span className="text-6xl">📅</span>
                <div>
                  <p className="font-semibold text-[hsl(220,10%,80%)] text-lg">No posts scheduled</p>
                  <p className={`text-sm ${dimText} mt-1`}>Create your first post to see it here</p>
                </div>
                <button onClick={() => setCreatePostModal(true)}
                  className="px-5 py-2.5 rounded-xl bg-[hsl(263,70%,65%)] text-white text-sm font-semibold hover:bg-[hsl(263,70%,58%)] transition-colors">
                  + Create Post{plan === "free" && monthPostCount >= limits.maxPostsPerMonth && <DiamondBadge />}
                </button>
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
                                <div key={post.id} onClick={() => { setPreviewPost(post); setPreviewSlide(0); }} className={`flex items-center gap-2 py-1 border-t ${border} cursor-pointer hover:bg-[hsl(220,14%,14%)] rounded transition-colors`}>
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                                  <p className={`text-xs ${dimText} truncate flex-1`}>{post.caption || `${post.slideCount} slides`}</p>
                                  {post.scheduledTime && <span className="text-[10px] text-[hsl(220,10%,40%)]">{post.scheduledTime}</span>}
                                  <div className="flex gap-2 flex-shrink-0">
                                    {post.mediaIds?.length ? <button onClick={(e) => { e.stopPropagation(); openPostForEdit(post); }} className={`text-[10px] ${dimText} hover:text-[hsl(263,70%,70%)]`}>✏️</button> : null}
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
                              <div key={post.id} onClick={() => { setPreviewPost(post); setPreviewSlide(0); }} className={`${card} border ${sc.card} p-3 space-y-2 cursor-pointer hover:border-[hsl(263,70%,65%)/40] transition-colors`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                                    <span className={`text-xs ${dimText}`}>{post.slideCount} slide{post.slideCount !== 1 ? "s" : ""}</span>
                                    {post.tagsSummary && <span className="text-sm leading-none">{post.tagsSummary}</span>}
                                    {post.mediaIds?.some((id) => { const m = mediaItems.find((x) => x.id === id); return m && isVideo(m.dataUrl, m.media_type); }) && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(220,14%,22%)] text-white/70 border border-[hsl(220,13%,30%)]">▶ Video</span>
                                    )}
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className={`text-xs ${dimText}`}>{formatDayShort(post.scheduledDate ?? post.day)}</div>
                                    {post.scheduledTime && <div className="text-[10px] text-[hsl(220,10%,40%)]">🕐 {post.scheduledTime}</div>}
                                  </div>
                                </div>
                                {post.caption && <p className="text-sm text-[hsl(220,10%,75%)] leading-relaxed">{post.caption}</p>}
                                <div className="flex items-center justify-between pt-0.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full border ${sc.badge}`}>
                                    {getPostStatus(post) === "scheduled" ? "🕐 Scheduled" : "✓ Posted"}
                                  </span>
                                  <div className="flex gap-3 items-center">
                                    {post.mediaIds?.length ? <button onClick={(e) => { e.stopPropagation(); openPostForEdit(post); }} className={`text-xs ${dimText} hover:text-[hsl(263,70%,70%)]`}>✏️ Edit</button> : null}
                                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmPost(post); }} className={`text-xs ${dimText} hover:text-red-400`}>🗑️ Delete</button>
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
                          <div key={post.id} onClick={() => { setPreviewPost(post); setPreviewSlide(0); }} className={`${card} border ${sc.card} overflow-hidden cursor-pointer hover:border-[hsl(263,70%,65%)/40] transition-colors`}>
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
                                  {post.mediaIds?.length ? <button onClick={(e) => { e.stopPropagation(); openPostForEdit(post); }} className={`text-xs ${dimText} hover:text-[hsl(263,70%,70%)]`}>✏️ Edit</button> : null}
                                  <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmPost(post); }} className={`text-xs ${dimText} hover:text-red-400`}>🗑️ Delete</button>
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

            {/* Plan & Usage */}
            <div className={`${card} p-5 space-y-4`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">🏷️ Your Plan</p>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${plan === "free" ? "bg-[hsl(220,13%,22%)] text-[hsl(220,10%,60%)]" : "bg-[hsl(263,70%,65%)/20] text-[hsl(263,70%,70%)]"}`}>
                  {PLAN_LABELS[plan]}
                </span>
              </div>
              {plan === "free" && (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={dimText}>Posts this month</span>
                      <span className={`font-medium ${monthPostCount >= limits.maxPostsPerMonth ? "text-red-400" : "text-[hsl(220,10%,70%)]"}`}>{monthPostCount} / {limits.maxPostsPerMonth}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[hsl(220,13%,18%)] overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${monthPostCount >= limits.maxPostsPerMonth ? "bg-red-500" : "bg-[hsl(263,70%,60%)]"}`} style={{ width: `${Math.min(100, (monthPostCount / limits.maxPostsPerMonth) * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={dimText}>Media pool</span>
                      <span className={`font-medium ${mediaTotal >= limits.maxMedia ? "text-red-400" : "text-[hsl(220,10%,70%)]"}`}>{mediaTotal} / {limits.maxMedia}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[hsl(220,13%,18%)] overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${mediaTotal >= limits.maxMedia ? "bg-red-500" : "bg-[hsl(263,70%,60%)]"}`} style={{ width: `${Math.min(100, (mediaTotal / limits.maxMedia) * 100)}%` }} />
                    </div>
                  </div>
                  <p className={`text-xs ${dimText}`}>
                    Free plan: {limits.maxPostsPerMonth} posts/month · {limits.maxMedia} media items · 1 account
                  </p>
                  <button onClick={() => { setUpgradeModalData({ reasons: [], canContinue: false, onContinue: () => {} }); setUpgradeModalOpen(true); }}
                    className="w-full py-2.5 rounded-xl bg-[hsl(263,70%,65%)/15] border border-[hsl(263,70%,65%)/30] text-[hsl(263,70%,70%)] text-sm font-medium hover:bg-[hsl(263,70%,65%)/25] transition-colors">
                    💎 View Pro plans
                  </button>
                </div>
              )}
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
                  <label className={`text-xs font-medium ${dimText} flex items-center gap-1`}>Caption Prompt{plan === "free" && <DiamondBadge />}</label>
                  <button onClick={() => { if (plan === "free") { openProGate("Caption prompt"); return; } setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, captionPrompt: DEFAULT_CAPTION_PROMPT } })); }}
                    className={`text-[10px] px-2 py-1 rounded border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}>↺ Reset</button>
                </div>
                <textarea
                  rows={5}
                  readOnly={plan === "free"}
                  onClick={plan === "free" ? () => openProGate("Caption prompt") : undefined}
                  value={appSettings.captionSettings.captionPrompt ?? DEFAULT_CAPTION_PROMPT}
                  onChange={(e) => { if (plan === "free") return; setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, captionPrompt: e.target.value } })); }}
                  className={`w-full ${inputCls} resize-none text-xs leading-relaxed ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`}
                />
                <p className={`text-[10px] ${dimText} mt-1`}>This is the base instruction sent to the AI for every caption.</p>
              </div>

              <div>
                <p className={`text-xs ${dimText} mb-1.5 flex items-center gap-1`}>Tone{plan === "free" && <DiamondBadge />}</p>
                <input value={appSettings.captionSettings.tone}
                  readOnly={plan === "free"}
                  onClick={plan === "free" ? () => openProGate("Caption tone") : undefined}
                  onChange={(e) => { if (plan === "free") return; setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, tone: e.target.value } })); }}
                  placeholder="e.g. cool, modern, lowercase" className={`w-full ${inputCls} mb-2 ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`} />
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_TONES.map((t) => {
                    const active = appSettings.captionSettings.tone.includes(t);
                    return <button key={t}
                      disabled={plan === "free"}
                      onClick={plan === "free" ? () => openProGate("Caption tone") : () => setAppSettings((s) => { const tones = s.captionSettings.tone.split(",").map((x) => x.trim()).filter(Boolean); const next = tones.includes(t) ? tones.filter((x) => x !== t) : [...tones, t]; return { ...s, captionSettings: { ...s.captionSettings, tone: next.join(", ") } }; })}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${plan === "free" ? `${border} opacity-40 cursor-not-allowed` : active ? activeNavCls : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>{t}</button>;
                  })}
                </div>
              </div>
              <div>
                <p className={`text-xs ${dimText} mb-1.5 flex items-center gap-1`}>Preferred hashtags{plan === "free" && <DiamondBadge />}</p>
                <div className="flex gap-2 mb-2" onClick={plan === "free" ? () => openProGate("Preferred hashtags") : undefined}>
                  <input value={newHashtagInput}
                    readOnly={plan === "free"}
                    onChange={(e) => { if (plan === "free") return; setNewHashtagInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, "")); }}
                    onKeyDown={(e) => { if (plan === "free" || e.key !== "Enter") return; const v = newHashtagInput.trim(); if (v && !appSettings.captionSettings.hashtags.includes(v)) { setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: [...s.captionSettings.hashtags, v] } })); setNewHashtagInput(""); } }}
                    placeholder="Add hashtag…" className={`flex-1 ${inputCls} ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`} />
                  <button onClick={() => { if (plan === "free") { openProGate("Preferred hashtags"); return; } const v = newHashtagInput.trim(); if (v && !appSettings.captionSettings.hashtags.includes(v)) { setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: [...s.captionSettings.hashtags, v] } })); setNewHashtagInput(""); } }}
                    className="text-xs px-3 py-2 rounded-lg bg-[hsl(263,70%,65%)] text-white">Add</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {SUGGESTED_HASHTAGS.filter((h) => !appSettings.captionSettings.hashtags.includes(h)).slice(0, 6).map((h) => (
                    <button key={h} disabled={plan === "free"} onClick={plan === "free" ? () => openProGate("Preferred hashtags") : () => setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: [...s.captionSettings.hashtags, h] } }))}
                      className={`text-xs px-2 py-1 rounded-lg border ${border} ${plan === "free" ? "opacity-40 cursor-not-allowed" : `${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>+ #{h}</button>
                  ))}
                </div>
                {appSettings.captionSettings.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {appSettings.captionSettings.hashtags.map((h) => (
                      <span key={h} className="text-xs px-2 py-1 rounded-lg bg-[hsl(263,70%,65%)/15] text-[hsl(263,70%,70%)] border border-[hsl(263,70%,65%)/25] flex items-center gap-1">
                        #{h}
                        <button onClick={() => { if (plan === "free") { openProGate("Preferred hashtags"); return; } setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: s.captionSettings.hashtags.filter((x) => x !== h) } })); }}
                          className="text-[hsl(263,70%,50%)] hover:text-red-400 text-[10px]">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className={`text-xs ${dimText} mb-1.5 flex items-center gap-1`}>Additional instructions <span className="text-[hsl(220,10%,35%)]">(appended to every prompt)</span>{plan === "free" && <DiamondBadge />}</p>
                <textarea
                  rows={2}
                  readOnly={plan === "free"}
                  onClick={plan === "free" ? () => openProGate("Additional caption instructions") : undefined}
                  value={appSettings.captionSettings.customInstructions ?? ""}
                  onChange={(e) => { if (plan === "free") return; setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, customInstructions: e.target.value } })); }}
                  placeholder="e.g. Always mention the city. Avoid the word 'journey'."
                  className={`w-full ${inputCls} resize-none ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`}
                />
              </div>
            </div>

            {/* Manage Tags */}
            <div className={`${card} p-5 space-y-4`}>
              <p className="text-sm font-semibold">🏷️ Manage Tags</p>
              <div>
                <p className={`text-xs ${dimText} mb-1.5`}>Add custom tag — type a word and pick an emoji{plan === "free" && <DiamondBadge />}</p>
                {/* Emoji preview row */}
                {newTagInput.trim() && plan !== "free" && (
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
                <div className="flex gap-2" onClick={plan === "free" ? () => openProGate("Custom tags") : undefined}>
                  <input value={newTagInput}
                    readOnly={plan === "free"}
                    onChange={(e) => {
                      if (plan === "free") return;
                      const val = e.target.value;
                      setNewTagInput(val);
                      const suggested = suggestEmoji(val);
                      setTagInputEmoji(suggested);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" && plan !== "free") addCustomTag(); }}
                    placeholder="e.g. Beach, Gym, Party…" className={`flex-1 ${inputCls} ${plan === "free" ? "opacity-40 cursor-pointer" : ""}`} />
                  <button onClick={() => { if (plan === "free") { openProGate("Custom tags"); return; } addCustomTag(); }} disabled={plan !== "free" && !newTagInput.trim()}
                    className="text-xs px-3 py-2 rounded-lg bg-[hsl(263,70%,65%)] text-white disabled:opacity-40">Add</button>
                </div>
                {newTagInput.trim() && plan !== "free" && (
                  <p className={`text-[10px] ${dimText} mt-1`}>Will be saved as: <span className="text-[hsl(220,10%,70%)]">{tagInputEmoji} {newTagInput.trim().charAt(0).toUpperCase() + newTagInput.trim().slice(1)}</span></p>
                )}
              </div>
              <div>
                <p className={`text-xs ${dimText} mb-1.5`}>Active tags{plan === "free" && <DiamondBadge />}</p>
                <div className="flex flex-wrap gap-1.5">
                  {allAvailableTags.map((tag) => (
                    <span key={tag} className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${tagColor(tag, appSettings.customTags)}`}>
                      {tagIcon(tag)} {tagLabel(tag)}
                      <button onClick={() => {
                        if (plan === "free") { openProGate("Managing active tags"); return; }
                        BASE_TAGS.includes(tag)
                          ? setAppSettings((s) => ({ ...s, hiddenBaseTags: [...s.hiddenBaseTags, tag] }))
                          : setAppSettings((s) => ({ ...s, customTags: s.customTags.filter((t) => t !== tag) }));
                      }}
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
                <p className={`text-xs font-medium ${dimText} mb-2`}>Slide order{plan === "free" && <DiamondBadge />}</p>
                <div className="space-y-2" onClick={plan === "free" ? () => openProGate("Slide order") : undefined}>
                  {([
                    { rule: "tag-sequence" as const, icon: "🔢", label: "Follow tag sequence", desc: "Define the exact order by tag" },
                    { rule: "ai-free" as const, icon: "🤖", label: "AI chooses freely", desc: "AI picks the best order" },
                  ]).map(({ rule, icon, label, desc }) => {
                    const active = appSettings.slideOrderRule === rule;
                    return (
                      <button key={rule}
                        disabled={plan === "free"}
                        onClick={plan === "free" ? undefined : () => setAppSettings((s) => ({ ...s, slideOrderRule: rule }))}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          plan === "free" ? `${border} opacity-50 cursor-not-allowed` :
                          active ? "border-[hsl(263,70%,65%)/60] bg-[hsl(263,70%,65%)/10]" : `${border} hover:bg-[hsl(220,14%,15%)]`}`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active && plan !== "free" ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)]" : "border-[hsl(220,13%,35%)]"}`}>
                          {active && plan !== "free" && <span className="text-white text-[8px] font-bold">✓</span>}
                        </div>
                        <span className="text-sm">{icon}</span>
                        <div>
                          <p className={`text-xs font-medium ${active && plan !== "free" ? "text-[hsl(220,10%,90%)]" : "text-[hsl(220,10%,70%)]"}`}>{label}</p>
                          <p className={`text-[10px] ${dimText}`}>{desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* Tag sequence editor — hidden for free plan */}
                {appSettings.slideOrderRule === "tag-sequence" && plan !== "free" && (
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
                <p className={`text-xs font-medium ${dimText} mb-2`}>Preferred content tags <span className="font-normal text-[hsl(220,10%,35%)]">— AI prioritizes these</span>{plan === "free" && <DiamondBadge />}</p>
                <div className="flex flex-wrap gap-2">
                  {allAvailableTags.map((tag) => {
                    const active = appSettings.preferredTags.includes(tag);
                    return <button key={tag}
                      disabled={plan === "free"}
                      onClick={plan === "free" ? () => openProGate("Preferred content tags") : () => setAppSettings((s) => ({ ...s, preferredTags: active ? s.preferredTags.filter((t) => t !== tag) : [...s.preferredTags, tag] }))}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${plan === "free" ? `${border} opacity-50 cursor-not-allowed` : active ? tagColor(tag, appSettings.customTags) : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                      {tagIcon(tag)} {tagLabel(tag)}
                    </button>;
                  })}
                </div>
              </div>

              {/* Custom AI instructions */}
              <div>
                <p className={`text-xs font-medium ${dimText} mb-1.5`}>Custom AI instructions <span className="font-normal text-[hsl(220,10%,35%)]">(optional)</span>{plan === "free" && <DiamondBadge />}</p>
                <textarea
                  readOnly={plan === "free"}
                  onClick={plan === "free" ? () => openProGate("Custom AI instructions") : undefined}
                  value={appSettings.aiCustomPreferences}
                  onChange={(e) => { if (plan === "free") return; setAppSettings((s) => ({ ...s, aiCustomPreferences: e.target.value })); }}
                  rows={2}
                  placeholder="e.g. always include a DJ photo, prefer night shots on weekends"
                  className={`w-full bg-[hsl(220,14%,9%)] border ${border} rounded-xl p-3 text-sm text-[hsl(220,10%,85%)] placeholder:text-[hsl(220,10%,30%)] resize-none focus:outline-none focus:border-[hsl(263,70%,65%)/50] ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`}
                />
              </div>
            </div>

            {/* Post Safety */}
            <div className={`${card} p-5 space-y-4`}>
              <div>
                <p className="text-sm font-semibold">🛡️ Post Safety</p>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[hsl(220,10%,85%)]">
                    Prevent duplicate media across posts{plan === "free" && <DiamondBadge />}
                  </p>
                  <p className={`text-xs ${dimText} mt-0.5 leading-relaxed`}>Avoid using the same photo or video in multiple drafts or scheduled posts</p>
                </div>
                <button
                  onClick={plan === "free" ? () => openProGate("Post Safety — Prevent duplicate media") : () => setPreventDuplicates((v) => !v)}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${plan !== "free" && preventDuplicates ? "bg-[hsl(263,70%,65%)]" : "bg-[hsl(220,13%,25%)]"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${plan !== "free" && preventDuplicates ? "translate-x-5" : "translate-x-0"}`} />
                </button>
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
              {supabase && session && (
                <button
                  onClick={async () => { await supabase!.auth.signOut(); }}
                  className={`w-full py-2.5 rounded-xl border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors`}>
                  Sign Out
                </button>
              )}
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
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => { if (bulkSelectedIds.length > 0) setFolderPickerOpen(true); }}
              disabled={bulkSelectedIds.length === 0}
              className={`py-2.5 rounded-xl border ${border} text-xs font-medium flex flex-col items-center gap-1 ${dimText} hover:bg-[hsl(220,14%,18%)] disabled:opacity-40 transition-colors`}>
              <FolderPlus className="w-5 h-5" />Folder
            </button>
            <button onClick={handleBulkCreatePost} disabled={bulkSelectedIds.length === 0}
              className={`py-2.5 rounded-xl bg-[hsl(263,70%,65%)/15] border border-[hsl(263,70%,65%)/30] text-xs font-medium flex flex-col items-center gap-1 text-[hsl(263,70%,75%)] hover:bg-[hsl(263,70%,65%)/25] disabled:opacity-40 transition-colors`}>
              <LayoutTemplate className="w-5 h-5" />
              {bulkSelectedIds.length === 1 ? "Single" : bulkSelectedIds.length >= 2 ? "Carousel" : "Post"}
            </button>
            <button
              onClick={async () => {
                if (bulkSelectedIds.length === 0) return;
                await Promise.all(bulkSelectedIds.map((id) => toggleFavorite(id)));
              }}
              disabled={bulkSelectedIds.length === 0}
              className={`py-2.5 rounded-xl border ${border} text-xs font-medium flex flex-col items-center gap-1 ${dimText} hover:bg-[hsl(220,14%,18%)] disabled:opacity-40 transition-colors`}>
              <Heart className="w-5 h-5" />Favourite
            </button>
            <button onClick={handleBulkDelete} disabled={bulkSelectedIds.length === 0}
              className="py-2.5 rounded-xl border border-red-500/20 text-xs font-medium flex flex-col items-center gap-1 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors">
              <Trash2 className="w-5 h-5" />Delete
            </button>
          </div>
        </div>
      )}

      {/* ── FULLSCREEN VIEWER — iOS Photos style ── */}
      {viewerItem && (() => {
        const liveItem = mediaItems.find((m) => m.id === viewerItem.id) ?? viewerItem;
        const liveTag = liveItem.tag;
        const isFav = !!liveItem.isFavorite;
        const dateStr = viewerItem.createdAt
          ? new Date(viewerItem.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
          : "";
        const timeStr = viewerItem.createdAt
          ? new Date(viewerItem.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
          : "";
        return (
          <div className="fixed inset-0 z-40 flex flex-col bg-[hsl(220,14%,6%)]" style={{ userSelect: "none" }}>
            {/* Top bar */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 pt-safe pt-10 pb-3 absolute top-0 left-0 right-0 z-10">
              {(dateStr || timeStr) ? (
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
                  {dateStr && <span className="text-white/90 text-xs font-medium">{dateStr}</span>}
                  {dateStr && timeStr && <span className="text-white/30 text-xs">·</span>}
                  {timeStr && <span className="text-white/50 text-xs">{timeStr}</span>}
                </div>
              ) : <div />}
              <div className="flex items-center gap-2">
                {viewerNavList.length > 1 && (
                  <span className="text-white/60 text-xs bg-black/40 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5 tabular-nums">
                    {viewerNavIdx + 1} / {viewerNavList.length}
                  </span>
                )}
                <button onClick={() => { setViewerItem(null); setViewerTagPickerOpen(false); }}
                  className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white text-base leading-none transition-colors">
                  ✕
                </button>
              </div>
            </div>

            {/* Main content — flex column, tap dark bg to close */}
            <div className="flex-1 flex flex-col justify-center gap-3 pt-20 pb-6 overflow-y-auto" onClick={() => { setViewerItem(null); setViewerTagPickerOpen(false); }}>

              {/* ── Swipeable strip ── */}
              {/* Outer: relative wrapper for clip + badge overlays */}
              <div className="w-full relative" style={{ aspectRatio: "4/5" }} onClick={(e) => e.stopPropagation()}>
                {/* Clip zone with swipe handlers */}
                <div
                  className="absolute inset-0 overflow-hidden rounded-xl"
                  style={{ cursor: viewerDragging ? "grabbing" : "grab", touchAction: "pan-y" }}
                  onTouchStart={(e) => onViewerDragStart(e.touches[0].clientX)}
                  onTouchMove={(e) => { e.stopPropagation(); onViewerDragMove(e.touches[0].clientX); }}
                  onTouchEnd={onViewerDragEnd}
                  onMouseDown={(e) => { e.preventDefault(); onViewerDragStart(e.clientX); }}
                  onMouseMove={(e) => { if (viewerDragging) { e.preventDefault(); onViewerDragMove(e.clientX); } }}
                  onMouseUp={onViewerDragEnd}
                  onMouseLeave={onViewerDragEnd}
                >
                  {/* 300%-wide flex strip — translateX(-33.333%) shows center panel */}
                  <div style={{
                    display: "flex",
                    width: "300%",
                    height: "100%",
                    transform: `translateX(calc(-33.333% + ${viewerDelta}px))`,
                    transition: viewerDragging ? "none" : "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                  }}>
                    {/* Prev panel */}
                    <div style={{ width: "33.333%", height: "100%", flexShrink: 0 }}>
                      {viewerNavIdx > 0 && (() => {
                        const prev = viewerNavList[viewerNavIdx - 1];
                        return isVideo(prev.dataUrl, prev.media_type)
                          ? <video key={prev.id} src={prev.dataUrl} poster={prev.thumbnail_url || (videoPosters[prev.id] ?? undefined)} muted playsInline preload="auto" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : <img src={prev.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
                      })()}
                    </div>
                    {/* Current panel */}
                    <div style={{ width: "33.333%", height: "100%", flexShrink: 0 }}>
                      {isVideo(viewerItem.dataUrl, viewerItem.media_type) ? (
                        <video
                          key={viewerItem.id}
                          src={viewerItem.dataUrl}
                          poster={viewerItem.thumbnail_url || (videoPosters[viewerItem.id] ?? undefined)}
                          autoPlay muted loop playsInline preload="auto"
                          controls controlsList="nodownload nofullscreen"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : (
                        <img key={viewerItem.id} src={viewerItem.dataUrl} alt={viewerItem.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      )}
                    </div>
                    {/* Next panel */}
                    <div style={{ width: "33.333%", height: "100%", flexShrink: 0 }}>
                      {viewerNavIdx < viewerNavList.length - 1 && (() => {
                        const next = viewerNavList[viewerNavIdx + 1];
                        return isVideo(next.dataUrl, next.media_type)
                          ? <video key={next.id} src={next.dataUrl} poster={next.thumbnail_url || (videoPosters[next.id] ?? undefined)} muted playsInline preload="auto" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : <img src={next.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />;
                      })()}
                    </div>
                  </div>
                </div>

                {/* Overlays — positioned over the center panel (not inside the clip/strip) */}
                {liveTag && (
                  <button
                    style={{ position: "absolute", top: 8, left: 8, zIndex: 10 }}
                    onClick={(e) => { e.stopPropagation(); setViewerTagPickerOpen(true); }}
                    className="text-xs px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white/90 border border-white/15 hover:bg-black/70 transition-colors leading-none flex items-center gap-1">
                    {tagIcon(liveTag)} {tagLabel(liveTag)}
                  </button>
                )}
                {isVideo(viewerItem.dataUrl, viewerItem.media_type) && (
                  <span style={{ position: "absolute", top: 8, right: 8, zIndex: 10 }} className="text-[10px] px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-white/80 border border-white/15 leading-none">▶</span>
                )}
                {swipeHintVisible && viewerNavList.length > 1 && (
                  <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10, animation: "fadeOut 2s ease forwards" }}>
                    <span className="text-xs text-white/80 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 whitespace-nowrap">← swipe to browse →</span>
                  </div>
                )}
              </div>

              {/* Action card */}
              <div className="w-full px-4" onClick={(e) => e.stopPropagation()}>
                <div className="bg-[hsl(220,14%,12%)] rounded-xl px-4 py-2">
                  <div className="flex items-center justify-around">
                    <button className="flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl hover:bg-white/8 transition-colors active:opacity-60"
                      onClick={() => { const item = viewerItem; setViewerItem(null); openSinglePost(item); }}>
                      <Square className="w-5 h-5" stroke="white" fill="none" />
                      <span className="text-[10px] text-white/60">Single Post</span>
                    </button>
                    <button className="flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl hover:bg-white/8 transition-colors active:opacity-60"
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
                      <LayoutTemplate className="w-5 h-5" stroke="white" fill="none" />
                      <span className="text-[10px] text-white/60">Carousel</span>
                    </button>
                    <button className="flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl hover:bg-white/8 transition-colors active:opacity-60"
                      onClick={() => { if (plan === "free") { openProGate("Favorites"); return; } toggleFavorite(viewerItem.id); }}>
                      <div className="relative">
                        <Heart className="w-5 h-5" stroke={isFav ? "#ef4444" : "white"} fill={isFav ? "#ef4444" : "none"} />
                        {plan === "free" && <span className="absolute -top-1 -right-2 text-[hsl(263,70%,65%)] text-[8px]">💎</span>}
                      </div>
                      <span className={`text-[10px] ${isFav ? "text-red-400" : "text-white/60"}`}>Favorite</span>
                    </button>
                    <button className="flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl hover:bg-white/8 transition-colors active:opacity-60"
                      onClick={() => setViewerTagPickerOpen(true)}>
                      <Tag className="w-5 h-5" stroke="white" fill="none" />
                      <span className="text-[10px] text-white/60">Tag</span>
                    </button>
                    <button className="flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl hover:bg-red-500/15 transition-colors active:opacity-60"
                      onClick={() => { const item = viewerItem; setViewerItem(null); handleDeleteMedia(item.id); }}>
                      <Trash2 className="w-5 h-5" stroke="#ef4444" fill="none" />
                      <span className="text-[10px] text-red-400">Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Inline tag picker — slides up inside viewer, no viewer close ── */}
            {viewerTagPickerOpen && (
              <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={() => setViewerTagPickerOpen(false)}>
                <div className="absolute inset-0 bg-black/50" />
                <div className="relative bg-[hsl(220,14%,12%)] border-t border-[hsl(220,13%,20%)] rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold">Change tag</p>
                    <button onClick={() => setViewerTagPickerOpen(false)} className="text-white/50 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                    {allAvailableTags.map((tag) => (
                      <button key={tag}
                        onClick={async () => {
                          setViewerTagPickerOpen(false);
                          await handleTagChange(viewerItem.id, tag);
                        }}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                          liveTag === tag
                            ? tagColor(tag, appSettings.customTags) + " ring-1 ring-inset ring-current"
                            : `${border} ${dimText} hover:bg-[hsl(220,14%,18%)]`
                        }`}>
                        <span className="text-base">{tagIcon(tag)}</span>
                        <span>{tagLabel(tag)}</span>
                        {liveTag === tag && <span className="ml-auto text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── USED MEDIA VIEWER ── */}
      {usedViewerItem && (() => {
        const uItem = mediaItems.find(m => m.id === usedViewerItem.id) ?? usedViewerItem;
        const dateStr = uItem.createdAt ? new Date(uItem.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "";
        return (
          <div className="fixed inset-0 z-40 flex flex-col bg-[hsl(220,14%,6%)]" style={{ userSelect: "none" }}>
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-10 pb-3">
              <div className="flex items-center gap-2">
                {uItem.tag && (
                  <span className={`text-xs px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 leading-none flex items-center gap-1 ${tagColor(uItem.tag, appSettings.customTags)}`}>
                    {tagIcon(uItem.tag)} {tagLabel(uItem.tag)}
                  </span>
                )}
                {dateStr && <span className="text-white/50 text-xs bg-black/40 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">{dateStr}</span>}
              </div>
              <button onClick={() => { setUsedViewerItem(null); setUsedViewerPost(null); setUsedViewerRemoveConfirm(false); }}
                className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white text-base leading-none">✕</button>
            </div>

            {/* Media */}
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 pt-20 pb-6">
              <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ aspectRatio: "4/5" }}>
                {isVideo(uItem.dataUrl, uItem.media_type) ? (
                  <video key={uItem.id} src={uItem.dataUrl} poster={uItem.thumbnail_url || (videoPosters[uItem.id] ?? undefined)}
                    autoPlay muted loop playsInline preload="auto" controls controlsList="nodownload nofullscreen"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <img src={uItem.dataUrl} alt={uItem.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                )}
              </div>

              {/* Action */}
              <div className="w-full max-w-sm">
                {usedViewerPost ? (
                  !usedViewerRemoveConfirm ? (
                    <button onClick={() => setUsedViewerRemoveConfirm(true)}
                      className="w-full py-3 rounded-xl border border-red-500/50 text-red-400 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors active:opacity-70">
                      <Trash2 className="w-4 h-4" /> Remove from Post
                    </button>
                  ) : (
                    <div className="bg-[hsl(220,14%,12%)] rounded-xl p-4 border border-[hsl(220,13%,22%)]">
                      <p className="text-sm font-semibold text-center mb-1">Remove from post?</p>
                      <p className={`text-xs ${dimText} text-center mb-4`}>The media stays in your pool.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setUsedViewerRemoveConfirm(false)}
                          className={`flex-1 py-2.5 rounded-xl border ${border} ${dimText} text-sm font-medium`}>Cancel</button>
                        <button onClick={handleRemoveFromPost}
                          className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-semibold">Remove from Post</button>
                      </div>
                    </div>
                  )
                ) : (
                  <p className={`text-xs ${dimText} text-center`}>This item is marked as used but not linked to a post.</p>
                )}
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
                          <span className="absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded bg-black/60 text-white">{tagIcon(item.tag)}</span>
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
              <button onClick={() => addMoreCameraRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(263,70%,65%)/15] text-[hsl(263,70%,70%)] border border-[hsl(263,70%,65%)/30] hover:bg-[hsl(263,70%,65%)/25]">📷 Camera</button>
              <button onClick={() => addMoreLibraryRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg bg-[hsl(263,70%,65%)/15] text-[hsl(263,70%,70%)] border border-[hsl(263,70%,65%)/30] hover:bg-[hsl(263,70%,65%)/25]">📁 Camera Roll</button>
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
                        {item.tag && !isSelected && <span className="absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded bg-black/60 text-white">{tagIcon(item.tag)}</span>}
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
            <div className="space-y-2">
              <button onClick={() => {
                setDiscardConfirm(false);
                const fn = discardAction;
                setDiscardAction(null);
                setDiscardSaveDraftAction(null);
                if (fn) fn();
              }}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
                Yes, Discard
              </button>
              {discardSaveDraftAction && (
                <button onClick={() => {
                  setDiscardConfirm(false);
                  const fn = discardSaveDraftAction;
                  setDiscardSaveDraftAction(null);
                  setDiscardAction(null);
                  fn();
                }}
                  className={`w-full py-2.5 rounded-xl border ${border} text-sm font-medium text-[hsl(263,70%,70%)] hover:bg-[hsl(263,70%,65%)/10] transition-colors`}>
                  💾 Save as Draft
                </button>
              )}
              <button onClick={() => setDiscardConfirm(false)}
                className={`w-full py-2.5 rounded-xl border ${border} text-sm font-medium ${dimText} hover:bg-[hsl(220,14%,18%)] transition-colors`}>
                No, keep editing
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

      {/* ── UPGRADE MODAL ── */}
      {upgradeModalOpen && upgradeModalData !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setUpgradeModalOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative bg-[hsl(220,14%,11%)] border border-[hsl(220,13%,20%)] rounded-t-3xl w-full max-w-lg pb-10 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[hsl(220,13%,18%)]">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold">Unlock with Pro 💎</h2>
                <button onClick={() => setUpgradeModalOpen(false)} className={`${dimText} hover:text-white text-xl`}>✕</button>
              </div>
              <p className={`text-sm ${dimText}`}>This action requires a paid plan</p>
            </div>
            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Blocked reasons */}
              {upgradeModalData.reasons.length > 0 && (
                <div className={`rounded-xl border border-[hsl(263,70%,65%)/30] bg-[hsl(263,70%,65%)/8] p-4 space-y-2`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${dimText}`}>Features requiring Pro</p>
                  {upgradeModalData.reasons.map((r) => (
                    <div key={r} className="flex items-center gap-2.5 text-sm text-[hsl(220,10%,75%)]">
                      <span className="text-[hsl(263,70%,65%)] flex-shrink-0">💎</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Plan comparison table */}
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                {(["free", "pro", "agency"] as const).map((tier) => {
                  const tl = PLAN_LIMITS[tier];
                  const isCurrent = tier === plan;
                  return (
                    <div key={tier} className={`rounded-xl border p-3 space-y-2 ${isCurrent ? "border-[hsl(220,13%,30%)] bg-[hsl(220,14%,15%)]" : tier === "pro" ? "border-[hsl(263,70%,65%)/40] bg-[hsl(263,70%,65%)/8]" : "border-[hsl(220,13%,20%)]"}`}>
                      <p className={`font-bold text-xs ${tier === "pro" ? "text-[hsl(263,70%,70%)]" : "text-[hsl(220,10%,70%)]"}`}>
                        {tier === "free" ? "Free" : tier === "pro" ? "Pro 💎" : "Agency 💎"}
                      </p>
                      {tier === "pro" && <p className="text-[hsl(263,70%,70%)] font-semibold">€9.99/mo</p>}
                      {tier === "agency" && <p className="text-[hsl(220,10%,60%)]">€29.99/mo</p>}
                      <div className={`space-y-1 ${dimText}`}>
                        <p>{tl.maxPostsPerMonth === Infinity ? "∞ posts" : `${tl.maxPostsPerMonth} posts/mo`}</p>
                        <p>{tl.maxMedia === Infinity ? "∞ media" : `${tl.maxMedia} media`}</p>
                        <p>{tl.aiCaptions ? "✓ AI Captions" : "✗ AI Captions"}</p>
                        <p>{tl.aiTagging ? "✓ AI Tagging" : "✗ AI Tagging"}</p>
                        <p>{tl.videoUpload ? "✓ Video Upload & Playback" : "✗ Video Upload & Playback"}</p>
                        <p>{tl.maxFolders === Infinity ? "✓ Unlimited folders" : "✗ Up to 1 folder"}</p>
                        <p>{tier === "free" ? "✗ Up to 3 drafts" : "✓ Unlimited drafts"}</p>
                        <p>{tier === "free" ? "✗ Favorites & Heart Filter" : "✓ Favorites & Heart Filter"}</p>
                        {tier === "agency" && <><p>✓ Multi-account</p><p>✓ Analytics Dashboard</p></>}
                        {tier !== "agency" && <p>✗ Analytics Dashboard</p>}
                      </div>
                      {isCurrent && <p className="text-[10px] text-[hsl(220,10%,45%)] font-medium">Current</p>}
                    </div>
                  );
                })}
              </div>
              {/* CTA buttons */}
              <div className="space-y-2 pt-1">
                <button onClick={() => { setUpgradeModalOpen(false); showGlobalToast("Upgrade coming soon — stay tuned! 🚀"); }}
                  className="w-full py-3.5 rounded-xl bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white font-semibold text-sm transition-colors">
                  Upgrade to Pro — €9.99/month
                </button>
                {upgradeModalData.canContinue && (
                  <button onClick={() => { setUpgradeModalOpen(false); upgradeModalData.onContinue(); }}
                    className={`w-full py-2.5 rounded-xl border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] text-sm font-medium transition-colors`}>
                    Continue on Free
                  </button>
                )}
              </div>
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
            <button onClick={() => {
              setFolderPickerOpen(false);
              if (plan === "free" && folders.length >= limits.maxFolders) {
                setUpgradeModalData({ reasons: [`Folder limit (${limits.maxFolders} folder on Free)`], canContinue: false, onContinue: () => {} });
                setUpgradeModalOpen(true);
              } else {
                setCreateFolderOpen(true);
              }
            }}
              className={`w-full py-2.5 rounded-xl border-2 border-dashed border-[hsl(220,13%,25%)] hover:border-[hsl(263,70%,65%)/50] text-sm ${dimText} hover:text-white transition-colors flex items-center justify-center gap-1.5`}>
              + New Folder{plan === "free" && <DiamondBadge />}
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
            {plan === "free" && (
              <div className="mb-4 p-3 rounded-xl border border-[hsl(263,70%,65%)/30] bg-[hsl(263,70%,65%)/8]">
                <p className="text-xs font-semibold text-[hsl(263,70%,75%)]">💎 AI Tagging &amp; manual tag editing is a Pro feature.</p>
                <p className={`text-xs ${dimText} mt-0.5`}>Upgrade to Pro to tag your media correctly.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {allAvailableTags.map((tag) => (
                <button key={tag}
                  disabled={plan === "free"}
                  onClick={plan === "free" ? undefined : () => handleTagChange(tagPickerItem.id, tag)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    plan === "free"
                      ? `${border} opacity-40 cursor-not-allowed`
                      : tagPickerItem.tag === tag
                        ? tagColor(tag, appSettings.customTags) + " ring-1 ring-inset ring-current"
                        : `${border} ${dimText} hover:bg-[hsl(220,14%,18%)]`
                  }`}>
                  <span className="text-base">{tagIcon(tag)}</span><span>{tagLabel(tag)}</span>
                  {tagPickerItem.tag === tag && plan !== "free" && <span className="ml-auto text-xs">✓</span>}
                </button>
              ))}
            </div>
            {plan === "free" && (
              <button onClick={() => { closeTagPicker(); openProGate("AI Tagging & manual tag editing"); }}
                className="mt-4 w-full py-2.5 rounded-xl bg-[hsl(263,70%,65%)] text-white text-sm font-semibold">
                Upgrade to Pro 💎
              </button>
            )}
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

      {/* Video disabled banner removed — video upload is now fully supported for Pro/Agency */}

      {/* ── DUPLICATES BANNER ── */}
      {duplicatesBanner.length > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[hsl(220,20%,15%)] border-b border-[hsl(220,13%,25%)] px-4 py-3 flex items-center gap-3">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[hsl(220,10%,85%)]">File already exists</p>
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
            <button onClick={() => { setFolderAddSourceSheet(false); folderCameraInputRef.current?.click(); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border ${border} hover:bg-[hsl(220,14%,16%)] transition-colors`}>
              <span className="text-2xl">📷</span>
              <div className="text-left">
                <p className="text-sm font-semibold">Take Photo</p>
                <p className={`text-xs ${dimText}`}>Use your camera to take a new photo</p>
              </div>
            </button>
            <button onClick={() => { setFolderAddSourceSheet(false); folderFileInputRef.current?.click(); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border ${border} hover:bg-[hsl(220,14%,16%)] transition-colors`}>
              <span className="text-2xl">🖼</span>
              <div className="text-left">
                <p className="text-sm font-semibold">Choose from Library</p>
                <p className={`text-xs ${dimText}`}>Upload from your photo library</p>
              </div>
            </button>
            <button onClick={() => { setFolderAddSourceSheet(false); setFolderAddMode(true); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border ${border} hover:bg-[hsl(220,14%,16%)] transition-colors`}>
              <span className="text-2xl">📁</span>
              <div className="text-left">
                <p className="text-sm font-semibold">From Pool</p>
                <p className={`text-xs ${dimText}`}>Choose from already uploaded media</p>
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

      {/* ── PROFILE DRAWER ── */}
      {profileDrawerOpen && !profileSubpage && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setProfileDrawerOpen(false)} />
          <div className={`fixed top-0 right-0 h-full z-50 bg-[hsl(220,14%,11%)] border-l ${border} flex flex-col shadow-2xl`}
            style={{ width: "min(280px, 100vw)" }}>
            {/* Drawer Header */}
            <div className={`px-5 pt-6 pb-5 border-b ${border} flex-shrink-0`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[hsl(263,70%,65%)/40] bg-[hsl(220,14%,14%)] flex items-center justify-center flex-shrink-0">
                  {profileAvatarUrl
                    ? <img src={profileAvatarUrl} className="w-full h-full object-cover" alt="avatar" />
                    : <span className="text-2xl font-bold text-[hsl(263,70%,70%)]">{profileDisplayName?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? "?"}</span>
                  }
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[hsl(220,10%,90%)] truncate text-sm">{profileDisplayName || session?.user?.email?.split("@")[0] || "User"}</p>
                  <div className="flex items-center gap-1 mt-0.5 min-w-0">
                    <p className={`text-xs ${dimText} truncate`}>{session?.user?.email}</p>
                    {emailVerified === true
                      ? <div className="w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><Check className="w-2 h-2 text-white" strokeWidth={3} /></div>
                      : emailVerified === false
                        ? <div className="w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0"><AlertCircle className="w-2 h-2 text-white" strokeWidth={3} /></div>
                        : null}
                  </div>
                </div>
              </div>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
                plan === "agency" ? "text-amber-300 bg-amber-500/20 border-amber-500/30"
                : plan === "pro" ? "text-purple-300 bg-purple-500/20 border-purple-500/30"
                : "text-zinc-300 bg-zinc-500/20 border-zinc-500/30"
              }`}>{plan === "agency" ? "AGENCY" : plan === "pro" ? "PRO" : "FREE"}</span>
            </div>
            {/* Menu Items */}
            <div className="flex-1 overflow-y-auto py-2">
              {([
                { icon: "👤", label: "Profile", sub: "profile" as const },
                { icon: "🎨", label: "Preferences", sub: "preferences" as const },
                { icon: "📊", label: "Usage Overview", sub: "usage" as const },
                { icon: "💳", label: "Plan & Billing", sub: "billing" as const },
                { icon: "⚙️", label: "Account Settings", sub: "account" as const },
              ] as { icon: string; label: string; sub: "profile" | "usage" | "billing" | "account" | "preferences" }[]).map(({ icon, label, sub }) => (
                <button key={sub} onClick={() => { setProfileDrawerOpen(false); setProfileSubpage(sub); }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[hsl(220,14%,16%)] transition-colors">
                  <span className="text-base">{icon}</span>
                  <span className="flex-1 text-sm font-medium text-[hsl(220,10%,85%)]">{label}</span>
                  <ChevronRight className="w-4 h-4 text-[hsl(220,10%,35%)]" />
                </button>
              ))}
              <div className="mx-5 my-2 border-t border-[hsl(220,13%,20%)]" />
              <button onClick={() => supabase?.auth.signOut()}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[hsl(220,14%,16%)] transition-colors">
                <span className="text-base">🚪</span>
                <span className="flex-1 text-sm font-medium text-red-400">Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── PROFILE SUBPAGES ── */}
      {profileSubpage && (
        <div className="fixed inset-0 z-50 bg-[hsl(220,14%,8%)] flex flex-col overflow-hidden">
          {/* Subpage top bar */}
          <div className={`flex items-center px-4 py-3 border-b ${border} flex-shrink-0 bg-[hsl(220,14%,8%)]`}>
            <button onClick={() => { setProfileSubpage(null); setProfileDrawerOpen(true); }}
              className="flex items-center gap-1 text-sm text-[hsl(220,10%,55%)] hover:text-white transition-colors pr-3">
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <span className="flex-1 text-center text-sm font-semibold text-[hsl(220,10%,90%)] pr-12">
              {profileSubpage === "profile" ? "Profile"
                : profileSubpage === "usage" ? "Usage Overview"
                : profileSubpage === "billing" ? "Plan & Billing"
                : profileSubpage === "preferences" ? "Preferences"
                : "Account Settings"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pb-10">
            {/* ── PROFILE subpage ── */}
            {profileSubpage === "profile" && (
              <div className="px-4 pt-6 space-y-5">
                <div className="flex flex-col items-center">
                  <button onClick={() => !avatarUploading && avatarInputRef.current?.click()} className="relative">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[hsl(263,70%,65%)/40] bg-[hsl(220,14%,14%)] flex items-center justify-center">
                      {profileAvatarUrl
                        ? <img src={profileAvatarUrl} className="w-full h-full object-cover" alt="avatar" />
                        : <span className="text-3xl font-bold text-[hsl(263,70%,70%)]">{profileDisplayName?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? "?"}</span>
                      }
                      {avatarUploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
                          <span className="text-white text-xs animate-pulse">⏳</span>
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[hsl(263,70%,65%)] flex items-center justify-center text-white text-xs">{avatarUploading ? "⏳" : "📷"}</div>
                  </button>
                  <p className={`mt-2 text-xs ${dimText}`}>Tap to change photo</p>
                </div>
                <div className={`${card} p-5 space-y-4`}>
                  <div className="space-y-1.5">
                    <label className={`text-xs ${dimText}`}>Email</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-[hsl(220,10%,80%)]">{session?.user?.email}</span>
                      {emailVerified === true && <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">✓ verified</span>}
                      {emailVerified === false && <span className="text-xs text-amber-400">⚠️ not verified</span>}
                    </div>
                    {emailVerified === false && (
                      <div className="space-y-2 pt-1">
                        <p className={`text-xs ${dimText}`}>Check your inbox for a verification email.</p>
                        <button onClick={async () => {
                          try {
                            await supabase?.auth.resend({ type: "signup", email: session?.user?.email ?? "" });
                            showGlobalToast("Verification email sent!");
                          } catch { showGlobalToast("Failed to resend — please try again"); }
                        }} className="text-xs px-3 py-1.5 rounded-lg border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 transition-colors">
                          Resend verification email
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className={`text-xs ${dimText}`}>Display Name</label>
                    <div className="flex gap-2">
                      <input value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)}
                        placeholder="Your name"
                        className={`flex-1 bg-[hsl(220,14%,9%)] border ${border} rounded-xl px-3 py-2 text-sm text-[hsl(220,10%,85%)] focus:outline-none focus:border-[hsl(263,70%,65%)/60]`} />
                      <button onClick={handleSaveProfile} disabled={profileSaving}
                        className="px-3 py-2 rounded-xl bg-[hsl(263,70%,65%)] text-white text-xs font-medium disabled:opacity-50">
                        {profileSaving ? "…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── USAGE subpage ── */}
            {profileSubpage === "usage" && (
              <div className="px-4 pt-6 space-y-4">
                <div className={`${card} p-5 space-y-4`}>
                  {[
                    { label: "Posts this month", value: monthPostCount, max: limits.maxPostsPerMonth },
                    { label: "Media in pool", value: mediaItems.length, max: limits.maxMedia },
                    { label: "Folders", value: folders.length, max: limits.maxFolders },
                    { label: "Drafts", value: approvedPosts.filter((p) => p.status === "draft").length, max: 3 },
                  ].map(({ label, value, max }) => (
                    <div key={label} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${dimText}`}>{label}</span>
                        <span className="text-sm text-[hsl(220,10%,75%)]">{value} / {max === Infinity ? "∞" : max}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[hsl(220,14%,16%)] overflow-hidden">
                        <div className="h-full rounded-full bg-[hsl(263,70%,65%)] transition-all"
                          style={{ width: max === Infinity ? "4%" : `${Math.min(100, (value / max) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {plan === "free" && (
                  <button onClick={() => setProfileSubpage("billing")}
                    className="w-full py-2.5 rounded-xl bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white text-sm font-semibold">
                    Upgrade Plan
                  </button>
                )}
              </div>
            )}

            {/* ── BILLING subpage ── */}
            {profileSubpage === "billing" && (
              <div className="px-4 pt-6 space-y-4">
                <div className={`${card} p-5 space-y-4`}>
                  <div className="flex items-center gap-2">
                    <div className={`flex rounded-lg border ${border} overflow-hidden`}>
                      {(["monthly","yearly"] as const).map((p) => (
                        <button key={p} onClick={() => setProfileBillingPeriod(p)}
                          className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${profileBillingPeriod === p ? "bg-[hsl(263,70%,65%)] text-white" : dimText}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                    {profileBillingPeriod === "yearly" && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">Save 20%</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { name: "Free", key: "free", price: "€0", yearlyPrice: "€0" },
                      { name: "Pro", key: "pro", price: "€9.99/mo", yearlyPrice: "€7.99/mo" },
                      { name: "Agency", key: "agency", price: "€29.99/mo", yearlyPrice: "€23.99/mo" },
                    ].map((tier) => {
                      const isCurrent = tier.key === plan;
                      return (
                        <div key={tier.key} className={`p-3 rounded-xl border text-center ${isCurrent ? "border-[hsl(263,70%,65%)] bg-[hsl(263,70%,65%)/10]" : `border-[hsl(220,13%,22%)] bg-[hsl(220,14%,9%)]`}`}>
                          <p className="text-xs font-semibold text-[hsl(220,10%,85%)]">{tier.name}</p>
                          <p className={`text-[11px] mt-1 ${dimText}`}>{profileBillingPeriod === "yearly" ? tier.yearlyPrice : tier.price}</p>
                          {isCurrent && <p className="text-[9px] mt-1.5 text-[hsl(263,70%,70%)] font-medium">Current</p>}
                        </div>
                      );
                    })}
                  </div>
                  {profileBillingPeriod === "yearly" && (
                    <p className={`text-[10px] ${dimText} text-center`}>Pro billed €95.88/yr · Agency billed €287.88/yr</p>
                  )}
                  <div className={`space-y-2 text-sm ${dimText} pt-1`}>
                    <div className="flex justify-between"><span>Next billing date</span><span className="text-[hsl(220,10%,60%)]">—</span></div>
                    <div className="flex justify-between"><span>Payment method</span><span className="text-[hsl(220,10%,60%)]">—</span></div>
                  </div>
                  <p className={`text-xs ${dimText} text-center`}>No payments yet</p>
                  <button onClick={() => setUpgradeModalOpen(true)}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white">
                    Upgrade Plan
                  </button>
                  {plan !== "free" && (
                    <button onClick={() => showGlobalToast("Plan cancellation coming soon!")}
                      className={`w-full py-2 rounded-xl text-sm border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}>
                      Cancel Plan
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── ACCOUNT SETTINGS subpage ── */}
            {profileSubpage === "account" && (
              <div className="px-4 pt-6 space-y-4">
                {/* Profile info */}
                <div className={`${card} p-5 space-y-4`}>
                  <p className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Profile Info</p>
                  <div className="space-y-1.5">
                    <label className={`text-xs ${dimText}`}>Display Name</label>
                    <div className="flex gap-2">
                      <input value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)}
                        placeholder="Your name"
                        className={`flex-1 bg-[hsl(220,14%,9%)] border ${border} rounded-xl px-3 py-2 text-sm text-[hsl(220,10%,85%)] focus:outline-none`} />
                      <button onClick={handleSaveProfile} disabled={profileSaving}
                        className="px-3 py-2 rounded-xl bg-[hsl(263,70%,65%)] text-white text-xs font-medium disabled:opacity-50">
                        {profileSaving ? "…" : "Save"}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={`text-xs ${dimText}`}>Instagram Username</label>
                    <div className="flex gap-2">
                      <input value={profileInstagram} onChange={(e) => setProfileInstagram(e.target.value)}
                        placeholder="@yourusername"
                        className={`flex-1 bg-[hsl(220,14%,9%)] border ${border} rounded-xl px-3 py-2 text-sm text-[hsl(220,10%,85%)] focus:outline-none`} />
                      <button onClick={handleSaveProfile} disabled={profileSaving}
                        className="px-3 py-2 rounded-xl bg-[hsl(263,70%,65%)] text-white text-xs font-medium disabled:opacity-50">
                        {profileSaving ? "…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
                {/* Change password */}
                <div className={`${card} p-5 space-y-3`}>
                  <p className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Change Password</p>
                  <input type="password" value={profileNewPassword} onChange={(e) => setProfileNewPassword(e.target.value)}
                    placeholder="New password"
                    className={`w-full bg-[hsl(220,14%,9%)] border ${border} rounded-xl px-3 py-2 text-sm text-[hsl(220,10%,85%)] focus:outline-none`} />
                  <input type="password" value={profileConfirmPassword} onChange={(e) => setProfileConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className={`w-full bg-[hsl(220,14%,9%)] border ${border} rounded-xl px-3 py-2 text-sm text-[hsl(220,10%,85%)] focus:outline-none`} />
                  {profilePasswordMsg && (
                    <p className={`text-xs ${profilePasswordMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{profilePasswordMsg}</p>
                  )}
                  <button onClick={handleChangePassword} disabled={profilePasswordSaving || !profileNewPassword}
                    className={`w-full py-2 rounded-xl border ${border} text-sm ${dimText} hover:bg-[hsl(220,14%,16%)] disabled:opacity-50`}>
                    {profilePasswordSaving ? "Updating…" : "Update Password"}
                  </button>
                  <button onClick={handleForgotPassword} className={`text-sm ${dimText} hover:text-white transition-colors`}>
                    Send Password Reset Email →
                  </button>
                </div>
                {/* Regional */}
                <div className={`${card} p-5 space-y-4`}>
                  <p className="text-xs font-semibold text-[hsl(220,10%,50%)] uppercase tracking-wider">Regional Settings</p>
                  <div className="space-y-1.5">
                    <label className={`text-xs ${dimText}`}>Language</label>
                    <select value={profileLanguage} onChange={(e) => setProfileLanguage(e.target.value)}
                      className={`w-full bg-[hsl(220,14%,9%)] border ${border} rounded-xl px-3 py-2 text-sm text-[hsl(220,10%,85%)] focus:outline-none`}>
                      <option value="en">English</option>
                      <option value="de">Deutsch</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={`text-xs ${dimText}`}>Timezone</label>
                    <select value={profileTimezone} onChange={(e) => setProfileTimezone(e.target.value)}
                      className={`w-full bg-[hsl(220,14%,9%)] border ${border} rounded-xl px-3 py-2 text-sm text-[hsl(220,10%,85%)] focus:outline-none`}>
                      <optgroup label="Europe">
                        <option value="Europe/London">Europe/London</option>
                        <option value="Europe/Paris">Europe/Paris</option>
                        <option value="Europe/Berlin">Europe/Berlin</option>
                        <option value="Europe/Amsterdam">Europe/Amsterdam</option>
                        <option value="Europe/Brussels">Europe/Brussels</option>
                        <option value="Europe/Vienna">Europe/Vienna</option>
                        <option value="Europe/Zurich">Europe/Zurich</option>
                        <option value="Europe/Rome">Europe/Rome</option>
                        <option value="Europe/Madrid">Europe/Madrid</option>
                        <option value="Europe/Lisbon">Europe/Lisbon</option>
                        <option value="Europe/Stockholm">Europe/Stockholm</option>
                        <option value="Europe/Oslo">Europe/Oslo</option>
                        <option value="Europe/Copenhagen">Europe/Copenhagen</option>
                        <option value="Europe/Helsinki">Europe/Helsinki</option>
                        <option value="Europe/Warsaw">Europe/Warsaw</option>
                        <option value="Europe/Prague">Europe/Prague</option>
                        <option value="Europe/Budapest">Europe/Budapest</option>
                        <option value="Europe/Athens">Europe/Athens</option>
                        <option value="Europe/Istanbul">Europe/Istanbul</option>
                        <option value="Europe/Moscow">Europe/Moscow</option>
                      </optgroup>
                      <optgroup label="America">
                        <option value="America/New_York">America/New_York</option>
                        <option value="America/Chicago">America/Chicago</option>
                        <option value="America/Denver">America/Denver</option>
                        <option value="America/Los_Angeles">America/Los_Angeles</option>
                        <option value="America/Phoenix">America/Phoenix</option>
                        <option value="America/Anchorage">America/Anchorage</option>
                        <option value="America/Toronto">America/Toronto</option>
                        <option value="America/Vancouver">America/Vancouver</option>
                        <option value="America/Mexico_City">America/Mexico_City</option>
                        <option value="America/Bogota">America/Bogota</option>
                        <option value="America/Lima">America/Lima</option>
                        <option value="America/Santiago">America/Santiago</option>
                        <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                        <option value="America/Buenos_Aires">America/Argentina/Buenos_Aires</option>
                      </optgroup>
                      <optgroup label="Asia">
                        <option value="Asia/Dubai">Asia/Dubai</option>
                        <option value="Asia/Kolkata">Asia/Kolkata</option>
                        <option value="Asia/Colombo">Asia/Colombo</option>
                        <option value="Asia/Dhaka">Asia/Dhaka</option>
                        <option value="Asia/Bangkok">Asia/Bangkok</option>
                        <option value="Asia/Singapore">Asia/Singapore</option>
                        <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
                        <option value="Asia/Shanghai">Asia/Shanghai</option>
                        <option value="Asia/Tokyo">Asia/Tokyo</option>
                        <option value="Asia/Seoul">Asia/Seoul</option>
                        <option value="Asia/Jerusalem">Asia/Jerusalem</option>
                        <option value="Asia/Riyadh">Asia/Riyadh</option>
                        <option value="Asia/Karachi">Asia/Karachi</option>
                      </optgroup>
                      <optgroup label="Australia / Pacific">
                        <option value="Australia/Perth">Australia/Perth</option>
                        <option value="Australia/Adelaide">Australia/Adelaide</option>
                        <option value="Australia/Sydney">Australia/Sydney</option>
                        <option value="Australia/Melbourne">Australia/Melbourne</option>
                        <option value="Australia/Brisbane">Australia/Brisbane</option>
                        <option value="Pacific/Auckland">Pacific/Auckland</option>
                        <option value="Pacific/Honolulu">Pacific/Honolulu</option>
                        <option value="Pacific/Fiji">Pacific/Fiji</option>
                      </optgroup>
                      <optgroup label="Africa">
                        <option value="Africa/Cairo">Africa/Cairo</option>
                        <option value="Africa/Johannesburg">Africa/Johannesburg</option>
                        <option value="Africa/Lagos">Africa/Lagos</option>
                        <option value="Africa/Nairobi">Africa/Nairobi</option>
                        <option value="Africa/Casablanca">Africa/Casablanca</option>
                      </optgroup>
                    </select>
                  </div>
                  <button onClick={handleSaveProfile} disabled={profileSaving}
                    className="w-full py-2.5 rounded-xl bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)] text-white text-sm font-medium disabled:opacity-50">
                    {profileSaving ? "Saving…" : profileSaved ? "✓ Saved!" : "Save Regional Settings"}
                  </button>
                </div>
                {/* Danger zone */}
                <div className={`${card} p-5 space-y-3`}>
                  <p className="text-xs font-semibold text-red-400/80 uppercase tracking-wider">Danger Zone</p>
                  <button onClick={() => setDeleteAccountConfirm(true)}
                    className="w-full py-2.5 rounded-xl text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                    Delete Account
                  </button>
                </div>
                <button onClick={() => supabase?.auth.signOut()}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)] transition-colors`}>
                  Sign Out
                </button>
              </div>
            )}

            {/* ── PREFERENCES subpage ── */}
            {profileSubpage === "preferences" && (
              <div className="px-4 pt-6 space-y-5">

                {/* Caption Settings */}
                <div className={`${card} p-5 space-y-4`}>
                  <p className="text-sm font-semibold">✍️ Caption Settings</p>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className={`text-xs font-medium ${dimText} flex items-center gap-1`}>Caption Prompt{plan === "free" && <DiamondBadge />}</label>
                      <button onClick={() => { if (plan === "free") { openProGate("Caption prompt"); return; } setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, captionPrompt: DEFAULT_CAPTION_PROMPT } })); }}
                        className={`text-[10px] px-2 py-1 rounded border ${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}>↺ Reset</button>
                    </div>
                    <textarea
                      rows={5}
                      readOnly={plan === "free"}
                      onClick={plan === "free" ? () => openProGate("Caption prompt") : undefined}
                      value={appSettings.captionSettings.captionPrompt ?? DEFAULT_CAPTION_PROMPT}
                      onChange={(e) => { if (plan === "free") return; setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, captionPrompt: e.target.value } })); }}
                      className={`w-full ${inputCls} resize-none text-xs leading-relaxed ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`}
                    />
                    <p className={`text-[10px] ${dimText} mt-1`}>Base instruction sent to the AI for every caption.</p>
                  </div>

                  <div>
                    <p className={`text-xs ${dimText} mb-1.5 flex items-center gap-1`}>Tone{plan === "free" && <DiamondBadge />}</p>
                    <input value={appSettings.captionSettings.tone}
                      readOnly={plan === "free"}
                      onClick={plan === "free" ? () => openProGate("Caption tone") : undefined}
                      onChange={(e) => { if (plan === "free") return; setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, tone: e.target.value } })); }}
                      placeholder="e.g. cool, modern, lowercase" className={`w-full ${inputCls} mb-2 ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`} />
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTED_TONES.map((t) => {
                        const active = appSettings.captionSettings.tone.includes(t);
                        return <button key={t}
                          disabled={plan === "free"}
                          onClick={plan === "free" ? () => openProGate("Caption tone") : () => setAppSettings((s) => { const tones = s.captionSettings.tone.split(",").map((x) => x.trim()).filter(Boolean); const next = tones.includes(t) ? tones.filter((x) => x !== t) : [...tones, t]; return { ...s, captionSettings: { ...s.captionSettings, tone: next.join(", ") } }; })}
                          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${plan === "free" ? `${border} opacity-40 cursor-not-allowed` : active ? activeNavCls : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>{t}</button>;
                      })}
                    </div>
                  </div>

                  <div>
                    <p className={`text-xs ${dimText} mb-1.5 flex items-center gap-1`}>Preferred hashtags{plan === "free" && <DiamondBadge />}</p>
                    <div className="flex gap-2 mb-2" onClick={plan === "free" ? () => openProGate("Preferred hashtags") : undefined}>
                      <input value={newHashtagInput}
                        readOnly={plan === "free"}
                        onChange={(e) => { if (plan === "free") return; setNewHashtagInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, "")); }}
                        onKeyDown={(e) => { if (plan === "free" || e.key !== "Enter") return; const v = newHashtagInput.trim(); if (v && !appSettings.captionSettings.hashtags.includes(v)) { setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: [...s.captionSettings.hashtags, v] } })); setNewHashtagInput(""); } }}
                        placeholder="Add hashtag…" className={`flex-1 ${inputCls} ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`} />
                      <button onClick={() => { if (plan === "free") { openProGate("Preferred hashtags"); return; } const v = newHashtagInput.trim(); if (v && !appSettings.captionSettings.hashtags.includes(v)) { setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: [...s.captionSettings.hashtags, v] } })); setNewHashtagInput(""); } }}
                        className="text-xs px-3 py-2 rounded-lg bg-[hsl(263,70%,65%)] text-white">Add</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {SUGGESTED_HASHTAGS.filter((h) => !appSettings.captionSettings.hashtags.includes(h)).slice(0, 6).map((h) => (
                        <button key={h} disabled={plan === "free"} onClick={plan === "free" ? () => openProGate("Preferred hashtags") : () => setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: [...s.captionSettings.hashtags, h] } }))}
                          className={`text-xs px-2 py-1 rounded-lg border ${border} ${plan === "free" ? "opacity-40 cursor-not-allowed" : `${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>+ #{h}</button>
                      ))}
                    </div>
                    {appSettings.captionSettings.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {appSettings.captionSettings.hashtags.map((h) => (
                          <span key={h} className="text-xs px-2 py-1 rounded-lg bg-[hsl(263,70%,65%)/15] text-[hsl(263,70%,70%)] border border-[hsl(263,70%,65%)/25] flex items-center gap-1">
                            #{h}
                            <button onClick={() => { if (plan === "free") { openProGate("Preferred hashtags"); return; } setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, hashtags: s.captionSettings.hashtags.filter((x) => x !== h) } })); }}
                              className="text-[hsl(263,70%,50%)] hover:text-red-400 text-[10px]">✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className={`text-xs ${dimText} mb-1.5 flex items-center gap-1`}>Additional instructions <span className="text-[hsl(220,10%,35%)]">(appended to every prompt)</span>{plan === "free" && <DiamondBadge />}</p>
                    <textarea
                      rows={2}
                      readOnly={plan === "free"}
                      onClick={plan === "free" ? () => openProGate("Additional caption instructions") : undefined}
                      value={appSettings.captionSettings.customInstructions ?? ""}
                      onChange={(e) => { if (plan === "free") return; setAppSettings((s) => ({ ...s, captionSettings: { ...s.captionSettings, customInstructions: e.target.value } })); }}
                      placeholder="e.g. Always mention the city. Avoid the word 'journey'."
                      className={`w-full ${inputCls} resize-none ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`}
                    />
                  </div>
                </div>

                {/* Carousel Preferences */}
                <div className={`${card} p-5 space-y-5`}>
                  <div>
                    <p className="text-sm font-semibold">🎠 Carousel Preferences</p>
                    <p className={`text-xs ${dimText} mt-0.5`}>Control how the AI generates and orders carousel slides.</p>
                  </div>

                  <div>
                    <p className={`text-xs font-medium ${dimText} mb-2`}>Slide count</p>
                    <div className="flex gap-2 flex-wrap">
                      {(["random", 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20] as const).map((opt) => {
                        const val: number | "random" = opt;
                        const active = appSettings.carouselSize === val;
                        return (
                          <button key={String(opt)}
                            onClick={() => setAppSettings((s) => ({ ...s, carouselSize: val }))}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors font-medium ${active ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)] text-white" : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                            {opt === "random" ? "🎲 Random" : String(opt)}
                          </button>
                        );
                      })}
                    </div>
                    {appSettings.carouselSize === "random" && (
                      <p className={`text-[10px] ${dimText} mt-1`}>AI picks 2–12 slides based on available media.</p>
                    )}
                  </div>

                  <div>
                    <p className={`text-xs font-medium ${dimText} mb-2`}>Slide order{plan === "free" && <DiamondBadge />}</p>
                    <div className="space-y-2" onClick={plan === "free" ? () => openProGate("Slide order") : undefined}>
                      {([
                        { rule: "tag-sequence" as const, icon: "🔢", label: "Follow tag sequence", desc: "Define the exact order by tag" },
                        { rule: "ai-free" as const, icon: "🤖", label: "AI chooses freely", desc: "AI picks the best order" },
                      ]).map(({ rule, icon, label, desc }) => {
                        const active = appSettings.slideOrderRule === rule;
                        return (
                          <button key={rule}
                            disabled={plan === "free"}
                            onClick={plan === "free" ? undefined : () => setAppSettings((s) => ({ ...s, slideOrderRule: rule }))}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${plan === "free" ? `${border} opacity-50 cursor-not-allowed` : active ? "border-[hsl(263,70%,65%)/60] bg-[hsl(263,70%,65%)/10]" : `${border} hover:bg-[hsl(220,14%,15%)]`}`}>
                            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active && plan !== "free" ? "bg-[hsl(263,70%,65%)] border-[hsl(263,70%,65%)]" : "border-[hsl(220,13%,35%)]"}`}>
                              {active && plan !== "free" && <span className="text-white text-[8px] font-bold">✓</span>}
                            </div>
                            <span className="text-sm">{icon}</span>
                            <div>
                              <p className={`text-xs font-medium ${active && plan !== "free" ? "text-[hsl(220,10%,90%)]" : "text-[hsl(220,10%,70%)]"}`}>{label}</p>
                              <p className={`text-[10px] ${dimText}`}>{desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {appSettings.slideOrderRule === "tag-sequence" && plan !== "free" && (
                      <div className="mt-3 p-3 rounded-xl border border-[hsl(263,70%,65%)/20] bg-[hsl(263,70%,65%)/5] space-y-2">
                        <p className={`text-[10px] font-medium ${dimText}`}>Drag tags to define order (first = first slide):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {allAvailableTags.map((tag) => {
                            const idx = appSettings.tagSequence.indexOf(tag);
                            const inSeq = idx !== -1;
                            return (
                              <button key={tag}
                                onClick={() => setAppSettings((s) => ({ ...s, tagSequence: inSeq ? s.tagSequence.filter((t) => t !== tag) : [...s.tagSequence, tag] }))}
                                className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-all ${inSeq ? tagColor(tag, appSettings.customTags) + " ring-1 ring-inset ring-current" : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
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

                  <div>
                    <p className={`text-xs font-medium ${dimText} mb-2`}>Preferred content tags <span className="font-normal text-[hsl(220,10%,35%)]">— AI prioritizes these</span>{plan === "free" && <DiamondBadge />}</p>
                    <div className="flex flex-wrap gap-2">
                      {allAvailableTags.map((tag) => {
                        const active = appSettings.preferredTags.includes(tag);
                        return <button key={tag}
                          disabled={plan === "free"}
                          onClick={plan === "free" ? () => openProGate("Preferred content tags") : () => setAppSettings((s) => ({ ...s, preferredTags: active ? s.preferredTags.filter((t) => t !== tag) : [...s.preferredTags, tag] }))}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${plan === "free" ? `${border} opacity-50 cursor-not-allowed` : active ? tagColor(tag, appSettings.customTags) : `${border} ${dimText} hover:bg-[hsl(220,14%,16%)]`}`}>
                          {tagIcon(tag)} {tagLabel(tag)}
                        </button>;
                      })}
                    </div>
                  </div>

                  <div>
                    <p className={`text-xs font-medium ${dimText} mb-1.5`}>Custom AI instructions <span className="font-normal text-[hsl(220,10%,35%)]">(optional)</span>{plan === "free" && <DiamondBadge />}</p>
                    <textarea
                      readOnly={plan === "free"}
                      onClick={plan === "free" ? () => openProGate("Custom AI instructions") : undefined}
                      value={appSettings.aiCustomPreferences}
                      onChange={(e) => { if (plan === "free") return; setAppSettings((s) => ({ ...s, aiCustomPreferences: e.target.value })); }}
                      rows={2}
                      placeholder="e.g. always include a DJ photo, prefer night shots on weekends"
                      className={`w-full bg-[hsl(220,14%,9%)] border ${border} rounded-xl p-3 text-sm text-[hsl(220,10%,85%)] placeholder:text-[hsl(220,10%,30%)] resize-none focus:outline-none focus:border-[hsl(263,70%,65%)/50] ${plan === "free" ? "opacity-50 cursor-pointer" : ""}`}
                    />
                  </div>
                </div>

                {/* Tag Management */}
                <div className={`${card} p-5 space-y-4`}>
                  <p className="text-sm font-semibold">🏷️ Tag Management</p>
                  <div>
                    <p className={`text-xs ${dimText} mb-1.5`}>Add custom tag — type a word and pick an emoji{plan === "free" && <DiamondBadge />}</p>
                    {newTagInput.trim() && plan !== "free" && (
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
                    <div className="flex gap-2" onClick={plan === "free" ? () => openProGate("Custom tags") : undefined}>
                      <input value={newTagInput}
                        readOnly={plan === "free"}
                        onChange={(e) => { if (plan === "free") return; const val = e.target.value; setNewTagInput(val); setTagInputEmoji(suggestEmoji(val)); }}
                        onKeyDown={(e) => { if (e.key === "Enter" && plan !== "free") addCustomTag(); }}
                        placeholder="e.g. Beach, Gym, Party…" className={`flex-1 ${inputCls} ${plan === "free" ? "opacity-40 cursor-pointer" : ""}`} />
                      <button onClick={() => { if (plan === "free") { openProGate("Custom tags"); return; } addCustomTag(); }} disabled={plan !== "free" && !newTagInput.trim()}
                        className="text-xs px-3 py-2 rounded-lg bg-[hsl(263,70%,65%)] text-white disabled:opacity-40">Add</button>
                    </div>
                    {newTagInput.trim() && plan !== "free" && (
                      <p className={`text-[10px] ${dimText} mt-1`}>Will be saved as: <span className="text-[hsl(220,10%,70%)]">{tagInputEmoji} {newTagInput.trim().charAt(0).toUpperCase() + newTagInput.trim().slice(1)}</span></p>
                    )}
                  </div>
                  <div>
                    <p className={`text-xs ${dimText} mb-1.5`}>Active tags{plan === "free" && <DiamondBadge />}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allAvailableTags.map((tag) => (
                        <span key={tag} className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${tagColor(tag, appSettings.customTags)}`}>
                          {tagIcon(tag)} {tagLabel(tag)}
                          <button onClick={() => {
                            if (plan === "free") { openProGate("Managing active tags"); return; }
                            BASE_TAGS.includes(tag)
                              ? setAppSettings((s) => ({ ...s, hiddenBaseTags: [...s.hiddenBaseTags, tag] }))
                              : setAppSettings((s) => ({ ...s, customTags: s.customTags.filter((t) => t !== tag) }));
                          }}
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

                {/* Post Safety */}
                <div className={`${card} p-5 space-y-4`}>
                  <p className="text-sm font-semibold">🛡️ Post Safety</p>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[hsl(220,10%,85%)]">
                        Prevent duplicate media across posts{plan === "free" && <DiamondBadge />}
                      </p>
                      <p className={`text-xs ${dimText} mt-0.5 leading-relaxed`}>Avoid using the same photo or video in multiple drafts or scheduled posts</p>
                    </div>
                    <button
                      onClick={plan === "free" ? () => openProGate("Post Safety — Prevent duplicate media") : () => setPreventDuplicates((v) => !v)}
                      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${plan !== "free" && preventDuplicates ? "bg-[hsl(263,70%,65%)]" : "bg-[hsl(220,13%,25%)]"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${plan !== "free" && preventDuplicates ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>

                {/* Save */}
                <div className="space-y-2">
                  {settingsSaved && (
                    <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                      <span className="text-emerald-400 text-sm font-semibold">✓ Settings saved!</span>
                    </div>
                  )}
                  <button onClick={handleSaveSettings} disabled={settingsSaving}
                    className={`w-full py-3 rounded-xl text-white text-sm font-semibold transition-all ${settingsSaved ? "bg-emerald-500" : "bg-[hsl(263,70%,65%)] hover:bg-[hsl(263,70%,58%)]"} disabled:opacity-60`}>
                    {settingsSaving ? "Saving…" : settingsSaved ? "✓ Saved!" : "Save Preferences"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ── DELETE ACCOUNT CONFIRM ── */}
      {deleteAccountConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDeleteAccountConfirm(false)} />
          <div className={`relative w-full max-w-sm bg-[hsl(220,14%,13%)] border ${border} rounded-2xl p-6 space-y-4 shadow-2xl`}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
                <span className="text-red-400 text-xl">🗑</span>
              </div>
              <p className="text-base font-semibold text-[hsl(220,10%,90%)]">Delete Account</p>
              <p className={`text-sm ${dimText} leading-relaxed`}>This will permanently delete your account and all your data. This cannot be undone.</p>
            </div>
            <div className="space-y-2.5">
              <button onClick={handleDeleteAccount}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
                Delete Account
              </button>
              <button onClick={() => setDeleteAccountConfirm(false)}
                className={`w-full py-2.5 rounded-xl border ${border} text-sm font-medium ${dimText} hover:bg-[hsl(220,14%,18%)] transition-colors`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AVATAR UPLOAD INPUT ── */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

      {/* Hidden inputs */}
      <input ref={fileInputRef} type="file" accept={limits.videoUpload ? "image/*,video/mp4,video/quicktime,video/avi,video/webm,video/x-msvideo" : "image/*"} multiple className="hidden"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesAdded(files); e.target.value = ""; }} />
      <input ref={addMoreCameraRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesAdded(files, true); e.target.value = ""; }} />
      <input ref={addMoreLibraryRef} type="file" accept={limits.videoUpload ? "image/*,video/mp4,video/quicktime,video/avi,video/webm,video/x-msvideo" : "image/*"} multiple className="hidden"
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) handleFilesAdded(files); e.target.value = ""; }} />
      <input ref={folderCameraInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length && openFolder) handleFilesAdded(files, false, openFolder.id);
          e.target.value = "";
        }} />
      <input ref={folderFileInputRef} type="file" accept={limits.videoUpload ? "image/*,video/mp4,video/quicktime,video/avi,video/webm,video/x-msvideo" : "image/*"} multiple className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length && openFolder) handleFilesAdded(files, false, openFolder.id);
          e.target.value = "";
        }} />

      {/* Create Post choice modal (BUG 7) */}
      {createPostModal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={() => setCreatePostModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className={`relative w-full max-w-sm bg-[hsl(220,14%,12%)] border border-[hsl(220,13%,22%)] rounded-t-2xl flex flex-col`}
            style={{ maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <p className="font-semibold">Create Post</p>
              <button onClick={() => setCreatePostModal(false)} className="text-[hsl(220,10%,50%)] hover:text-white text-xl">✕</button>
            </div>
            <div className="px-5 pb-6 space-y-3">
              {([
                { icon: "🖼️", label: "Single Post", sub: "One image", action: () => { setCreatePostModal(false); setTodayBuildMode(true); goToScreen("pool"); enterSelectionMode("single"); } },
                { icon: "📸", label: "Carousel", sub: "2–20 images", action: () => { setCreatePostModal(false); setTodayBuildMode(true); goToScreen("pool"); enterSelectionMode("carousel"); } },
                { icon: "✨", label: "AI Generate Single", sub: "AI picks best image", action: () => { setCreatePostModal(false); handleAIGenerateSingle(); } },
                { icon: "🤖", label: "AI Generate Carousel", sub: "Rule-based or by theme", action: () => { setCreatePostModal(false); setAiTypeModal(true); } },
              ] as const).map((opt) => (
                <button key={opt.label} onClick={opt.action}
                  className={`w-full text-left px-4 py-3 rounded-xl border border-[hsl(220,13%,22%)] hover:bg-[hsl(220,14%,16%)] transition-colors flex items-center gap-3`}>
                  <span className="text-2xl">{opt.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-[hsl(220,10%,85%)]">{opt.label}</p>
                    <p className="text-xs text-[hsl(220,10%,50%)]">{opt.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {plusMenuOpen && <div className="fixed inset-0 z-[15]" onClick={() => setPlusMenuOpen(false)} />}
      {(filterDropdownOpen || sortDropdownOpen) && <div className="fixed inset-0 z-10" onClick={() => { setFilterDropdownOpen(false); setSortDropdownOpen(false); }} />}
    </div>
  );
}
