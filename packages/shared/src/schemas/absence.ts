import { z } from "zod";
import { timeString } from "./common.js";

export const createAbsenceSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().date("Date invalide (AAAA-MM-JJ)"),
  reason: z.string().optional(),
});
export type CreateAbsenceInput = z.infer<typeof createAbsenceSchema>;

export const resolveAbsenceDecisionSchema = z.object({
  taskId: z.string().min(1),
  startTime: timeString,
  endTime: timeString,
  replacementUserId: z.string().min(1).nullable(),
});

export const resolveAbsenceSchema = z.object({
  decisions: z.array(resolveAbsenceDecisionSchema),
});
export type ResolveAbsenceInput = z.infer<typeof resolveAbsenceSchema>;
