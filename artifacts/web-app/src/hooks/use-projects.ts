import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProjectSchema, type Project, type CreateProjectInput } from "@/lib/schemas";
import { z } from "zod";

const API_BASE = "/api/projects";

function parseWithLogging<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data;
}

export function useProjects() {
  return useQuery({
    queryKey: [API_BASE],
    queryFn: async () => {
      const res = await fetch(API_BASE, { credentials: "omit" });
      if (!res.ok) {
        if (res.status === 404) return []; // Fallback for mockup if API missing
        throw new Error("Failed to fetch projects");
      }
      const data = await res.json();
      return parseWithLogging(z.array(ProjectSchema), data, "projects.list");
    },
    // Adding initialData to ensure UI renders even if API is missing
    initialData: [
      {
        id: 1,
        name: "Website Redesign",
        description: "Overhaul the corporate website with the new design system.",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        name: "Q4 Marketing Campaign",
        description: "Assets and planning for the Q4 push.",
        status: "completed",
        createdAt: new Date(Date.now() - 86400000 * 10),
        updatedAt: new Date(),
      }
    ] as Project[],
  });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: [API_BASE, id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/${id}`, { credentials: "omit" });
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      return parseWithLogging(ProjectSchema, data, "projects.get");
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateProjectInput) => {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const json = await res.json();
      return parseWithLogging(ProjectSchema, json, "projects.create");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_BASE] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete project");
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_BASE] });
    },
  });
}
