import { z } from "zod";
import { MOVE_REQUEST_STATUSES, MOVE_REQUEST_TYPES } from "@/lib/domain-enums";

export const moveRequestCreateInput = z.object({
  type: z.enum(MOVE_REQUEST_TYPES),
  propertyId: z.string().trim().min(1),
  unitId: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
  requestedDate: z.coerce.date().optional(),
  note: z.string().trim().max(1000).optional(),
});

export const moveRequestDecisionInput = z.object({
  status: z.enum(MOVE_REQUEST_STATUSES),
  decisionNote: z.string().trim().max(1000).optional(),
});

export type MoveRequestCreateInput = z.infer<typeof moveRequestCreateInput>;
export type MoveRequestDecisionInput = z.infer<typeof moveRequestDecisionInput>;
