import { z } from "zod";
import { timeString } from "./common.js";
import { AllowedSlot } from "../enums.js";

const staffingBandSchema = z
  .object({
    startTime: timeString,
    endTime: timeString,
    minStaff: z.number().int().min(0),
    targetStaff: z.number().int().min(0),
    maxStaff: z.number().int().min(0),
  })
  .refine((b) => b.startTime < b.endTime, {
    message: "L'heure de fin doit être après l'heure de début",
    path: ["endTime"],
  })
  .refine((b) => b.minStaff <= b.targetStaff && b.targetStaff <= b.maxStaff, {
    message: "L'effectif doit respecter min ≤ cible ≤ max",
    path: ["targetStaff"],
  });
export type StaffingBandInput = z.infer<typeof staffingBandSchema>;

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
    // 0 = pas de minimum. "30 minutes sur une tâche n'a pas de sens" : empêche le moteur de
    // générer des blocs plus courts que ça pour cette tâche.
    minContinuousMinutes: z.number().int().min(0),
    minStaff: z.number().int().min(0),
    targetStaff: z.number().int().min(0),
    maxStaff: z.number().int().min(0),
    maxTraineeSlots: z.number().int().min(0),
    requiresTraining: z.boolean(),
    // Tranches horaires à effectif variable ; minStaff/targetStaff/maxStaff ci-dessus restent utilisés
    // comme valeurs par défaut pour toute heure de la journée non couverte par une tranche (vide = ces
    // valeurs s'appliquent à toute la journée). Non disponible pour allowedSlot === CUSTOM (voir refine
    // ci-dessous).
    staffingBands: z.array(staffingBandSchema).default([]),
  })
  .refine((data) => data.minStaff <= data.targetStaff && data.targetStaff <= data.maxStaff, {
    message: "L'effectif doit respecter min ≤ cible ≤ max",
    path: ["targetStaff"],
  })
  .refine((data) => data.allowedSlot !== "CUSTOM" || Boolean(data.customStartTime && data.customEndTime), {
    message: "Créneau personnalisé : heures de début et de fin requises",
    path: ["customStartTime"],
  })
  .refine((data) => data.minContinuousMinutes <= data.maxContinuousMinutes, {
    message: "La durée minimale ne peut pas dépasser la durée max continue",
    path: ["minContinuousMinutes"],
  })
  .refine((data) => data.staffingBands.length === 0 || data.allowedSlot !== "CUSTOM", {
    message: "Les tranches horaires ne sont pas disponibles pour un créneau personnalisé",
    path: ["staffingBands"],
  })
  .refine(
    (data) => {
      const sorted = [...data.staffingBands].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startTime < sorted[i - 1].endTime) return false;
      }
      return true;
    },
    { message: "Les tranches horaires ne doivent pas se chevaucher", path: ["staffingBands"] }
  );
export type TaskInput = z.infer<typeof taskInputSchema>;

export const reorderTasksSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});
export type ReorderTasksInput = z.infer<typeof reorderTasksSchema>;
