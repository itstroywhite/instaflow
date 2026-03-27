import { z } from "zod";

export const ProjectSchema = z.object({
  id: z.coerce.number(),
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "completed", "archived"]).default("active"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["active", "completed", "archived"]).default("active"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
