import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const mediaItems = pgTable("media_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tag: text("tag"),
  dataUrl: text("data_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const approvedPosts = pgTable("approved_posts", {
  id: text("id").primaryKey(),
  day: text("day").notNull(),
  caption: text("caption").notNull().default(""),
  tagsSummary: text("tags_summary").notNull().default(""),
  slideCount: text("slide_count").notNull().default("1"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
