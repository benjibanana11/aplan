import { z } from "zod";
import { timeString } from "./common.js";
import { AllowedSlot } from "../enums.js";

export const taskInputSchema = z
  .object({
    name: z.string().min(1, "Nom requis"),
    description: z.string().min(1, "Description requise"),
    category: z.string().min(1, "Catégorie requise"),
    allowedSlot: z.enum([
      AllowedSlot.MORNING,
      AllowedSlot.AFTERNOON,
      AllowedSlot.EVENING,
      AllowedSlot.ALL_DAY,
      AllowedSlot.CUSTOM,
    ]),
    customStartTime: timeString.optional(),
    customEndTime: timeString.optional(),
    maxContinuousMinutes: z.number().int().positive("Doit être positif"),
    minStaff: z.number().int().min(0),
    targetStaff: z.number().int().min(0),
    maxStaff: z.number().int().min(0),
    maxTraineeSlots: z.number().int().min(0),
    requiresTraining: z.boolean(),
  })
  .refine((data) => data.minStaff <= data.targetStaff && data.targetStaff <= data.maxStaff, {
    message: "L'effectif doit respecter min ≤ cible ≤ max",
    path: ["targetStaff"],
  })
  .refine((data) => data.allowedSlot !== "CUSTOM" || Boolean(data.customStartTime && data.customEndTime), {
    message: "Créneau personnalisé : heures de début et de fin requises",
    path: ["customStartTime"],
  });
export type TaskInput = z.infer<typeof taskInputSchema>;

export const reorderTasksSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});
export type ReorderTasksInput = z.infer<typeof reorderTasksSchema>;
