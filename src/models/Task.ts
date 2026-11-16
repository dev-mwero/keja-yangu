import mongoose, { type InferSchemaType, model, Schema } from "mongoose";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain-enums";

export type { TaskPriority, TaskStatus } from "@/lib/domain-enums";
export { TASK_PRIORITIES, TASK_STATUSES };

export interface ITask {
  ownerId: string;
  title: string;
  propertyId: string;
  propertyName?: string;
  priority: (typeof TASK_PRIORITIES)[number];
  status: (typeof TASK_STATUSES)[number];
  assignedTo?: string;
  assignedToName?: string;
  createdBy: string;
  createdByRole: string;
  createdByName?: string;
  dueDate: string;
  completedAt?: string;
  notes?: string;
}

const taskSchema = new Schema<ITask>(
  {
    ownerId: { type: String, required: true, trim: true, default: "" },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    propertyId: { type: String, required: true, trim: true },
    propertyName: { type: String, trim: true, default: "" },
    priority: { type: String, enum: [...TASK_PRIORITIES], default: "medium" },
    status: { type: String, enum: [...TASK_STATUSES], default: "open" },
    assignedTo: { type: String, trim: true, default: "" },
    assignedToName: { type: String, trim: true, default: "" },
    createdBy: { type: String, required: true, trim: true },
    createdByRole: { type: String, required: true, trim: true },
    createdByName: { type: String, trim: true, default: "" },
    dueDate: { type: String, required: true, trim: true },
    completedAt: { type: String, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

taskSchema.index({ ownerId: 1, status: 1 });
taskSchema.index({ propertyId: 1, status: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ createdBy: 1, createdAt: -1 });

export type TaskDocument = InferSchemaType<ITask>;

export const Task = mongoose.models.Task || model<ITask>("Task", taskSchema);
