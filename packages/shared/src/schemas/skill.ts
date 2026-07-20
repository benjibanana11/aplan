import { z } from "zod";
import { SkillStatus } from "../enums.js";

export const createSkillSchema = z.object({
  employeeId: z.string().min(1),
  taskId: z.string().min(1),
  hoursRequired: z.number().min(0),
});
export type CreateSkillInput = z.infer<typeof createSkillSchema>;

export const updateSkillSchema = z.object({
  hoursCompleted: z.number().min(0).optional(),
  hoursRequired: z.number().min(0).optional(),
  status: z.enum([SkillStatus.EN_FORMATION, SkillStatus.FORME, SkillStatus.REFERENT]).optional(),
});
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
