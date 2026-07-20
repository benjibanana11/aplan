import { z } from "zod";
import { timeString } from "./common.js";
import { PlanningSource } from "../enums.js";

export const generatePlanningSchema = z.object({
  date: z.string().date("Date invalide (AAAA-MM-JJ)"),
});
export type GeneratePlanningInput = z.infer<typeof generatePlanningSchema>;

export const planningBlockInputSchema = z.object({
  employeeId: z.string().min(1),
  taskId: z.string().min(1),
  startTime: timeString,
  endTime: timeString,
  source: z.enum([PlanningSource.GENERATED, PlanningSource.MANUAL]),
  justification: z.string().min(1),
  isTraining: z.boolean().optional().default(false),
  trainerName: z.string().nullable().optional(),
});
export type PlanningBlockInput = z.infer<typeof planningBlockInputSchema>;

export const validatePlanningSchema = z.object({
  date: z.string().date("Date invalide (AAAA-MM-JJ)"),
  blocks: z.array(planningBlockInputSchema),
});
export type ValidatePlanningInput = z.infer<typeof validatePlanningSchema>;
