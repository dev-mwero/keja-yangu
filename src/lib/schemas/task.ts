import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain-enums";

export const taskInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  propertyId: z.string().trim().max(64).optional().default(""),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  status: z.enum(TASK_STATUSES).default("open"),
  assignedTo: z.string().trim().max(120).optional().default(""),
  assignedToName: z.string().trim().max(120).optional().default(""),
  dueDate: z.string().trim().min(1, "Due date is required"),
  notes: z.string().trim().max(2000).optional().default(""),
});

export const taskUpdate = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  assignedTo: z.string().trim().max(120).optional(),
  assignedToName: z.string().trim().max(120).optional(),
  dueDate: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(2000).optional(),
  completedAt: z.string().optional(),
});

export type TaskInput = z.infer<typeof taskInput>;
export type TaskUpdate = z.infer<typeof taskUpdate>;
