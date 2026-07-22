import { z } from "zod";
import { timeString } from "./common.js";

export const workScheduleEntrySchema = z.object({
  date: z.string().date("Date invalide (AAAA-MM-JJ)"),
  startTime: timeString,
  endTime: timeString,
});
export type WorkScheduleEntryInput = z.infer<typeof workScheduleEntrySchema>;

export const putMonthlyScheduleSchema = z.object({
  entries: z.array(workScheduleEntrySchema),
});
export type PutMonthlyScheduleInput = z.infer<typeof putMonthlyScheduleSchema>;

export const upsertScheduleDaySchema = z.object({
  startTime: timeString,
  endTime: timeString,
});
export type UpsertScheduleDayInput = z.infer<typeof upsertScheduleDaySchema>;

export const schedulePresetSchema = z
  .object({
    startTime: timeString,
    endTime: timeString,
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "L'heure de fin doit être après l'heure de début",
    path: ["endTime"],
  });
export type SchedulePresetInput = z.infer<typeof schedulePresetSchema>;
