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
