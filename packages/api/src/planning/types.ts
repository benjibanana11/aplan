import type { AllowedSlot, SkillStatus } from "@aplan/shared";

export interface EmployeeSkill {
  taskId: string;
  status: SkillStatus;
}

export interface EmployeeContext {
  id: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  skills: EmployeeSkill[];
  yesterdayTaskIds: string[];
}

export interface TaskContext {
  id: string;
  name: string;
  priorityRank: number;
  allowedSlot: AllowedSlot;
  customStartMinutes?: number;
  customEndMinutes?: number;
  maxContinuousMinutes: number;
  minStaff: number;
  targetStaff: number;
  maxStaff: number;
  maxTraineeSlots: number;
  requiresTraining: boolean;
}

export interface EquityStats {
  /** key: `${employeeId}:${taskId}` -> count over the trailing window */
  countByEmployeeTask: Map<string, number>;
  /** key: taskId -> average count among trained employees over the trailing window */
  teamAverageByTask: Map<string, number>;
}

export interface DayContext {
  date: string;
  employees: EmployeeContext[];
  tasks: TaskContext[];
  equity: EquityStats;
  /** Minute-of-day boundary separating "morning" from "afternoon" (end of MORNING-slot, start of AFTERNOON-slot). */
  morningEndMinutes: number;
  /** Minute-of-day boundary separating "afternoon" from "evening" (end of AFTERNOON-slot, start of EVENING-slot). */
  afternoonEndMinutes: number;
}

export interface ProposedBlock {
  employeeId: string;
  taskId: string;
  startTime: string;
  endTime: string;
  justification: string;
  isTraining: boolean;
  trainerName: string | null;
}

export interface PlanningAlert {
  taskId: string;
  taskName: string;
  message: string;
}

export interface PlanningResult {
  blocks: ProposedBlock[];
  alerts: PlanningAlert[];
}
