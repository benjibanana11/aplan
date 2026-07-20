import { timeToMinutes } from "./time.js";
import type { EmployeeContext, EquityStats, TaskContext } from "./types.js";

export const MORNING_END = timeToMinutes("13:00");
export const AFTERNOON_END = timeToMinutes("18:00");

export function makeTask(overrides: Partial<TaskContext> & { id: string; priorityRank: number }): TaskContext {
  return {
    name: overrides.id,
    allowedSlot: "ALL_DAY",
    maxContinuousMinutes: 480,
    minStaff: 0,
    targetStaff: 1,
    maxStaff: 10,
    maxTraineeSlots: 0,
    requiresTraining: true,
    ...overrides,
  };
}

export function makeEmployee(overrides: Partial<EmployeeContext> & { id: string }): EmployeeContext {
  return {
    name: overrides.id,
    startMinutes: timeToMinutes("08:00"),
    endMinutes: timeToMinutes("16:00"),
    skills: [],
    yesterdayTaskIds: [],
    ...overrides,
  };
}

export function emptyEquity(): EquityStats {
  return { countByEmployeeTask: new Map(), teamAverageByTask: new Map() };
}
