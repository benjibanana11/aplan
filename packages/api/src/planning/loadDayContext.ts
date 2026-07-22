import type { AllowedSlot, SkillStatus } from "@aplan/shared";
import { prisma } from "../db.js";
import { parseDateOnly, timeToMinutes } from "./time.js";
import type { DayContext, EmployeeContext, EquityStats, TaskContext } from "./types.js";

const EQUITY_WINDOW_DAYS = 30;
const MORNING_END_TIME = "13:00";
const AFTERNOON_END_TIME = "18:00";

export async function loadDayContext(teamId: string, date: string): Promise<DayContext> {
  const dayStart = parseDateOnly(date);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const yesterdayStart = new Date(dayStart);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const equityWindowStart = new Date(dayStart);
  equityWindowStart.setUTCDate(equityWindowStart.getUTCDate() - EQUITY_WINDOW_DAYS);

  const [schedules, tasks, skills, yesterdayBlocks, equityBlocks, absences] = await Promise.all([
    prisma.workSchedule.findMany({
      // "active" vit désormais sur TeamMembership (par équipe), pas sur User — un employé peut
      // être actif sur une équipe et pas une autre.
      where: {
        date: { gte: dayStart, lt: dayEnd },
        teamId,
        employee: { memberships: { some: { teamId, active: true } } },
      },
      include: { employee: { select: { id: true, name: true } } },
    }),
    prisma.task.findMany({ where: { teamId } }),
    prisma.employeeTaskSkill.findMany({
      where: { teamId },
      select: { employeeId: true, taskId: true, status: true },
    }),
    prisma.planningBlock.findMany({
      where: { date: { gte: yesterdayStart, lt: dayStart }, teamId },
      select: { employeeId: true, taskId: true },
    }),
    prisma.planningBlock.findMany({
      where: { date: { gte: equityWindowStart, lt: dayStart }, teamId },
      select: { employeeId: true, taskId: true, date: true },
    }),
    // Une absence REJECTED n'exclut personne (la personne est bien présente) ; PENDING et VALIDATED oui.
    prisma.absence.findMany({
      where: { date: { gte: dayStart, lt: dayEnd }, teamId, status: { not: "REJECTED" } },
      select: { employeeId: true },
    }),
  ]);
  const absentEmployeeIds = new Set(absences.map((a) => a.employeeId));

  const skillsByEmployee = new Map<string, { taskId: string; status: SkillStatus }[]>();
  for (const skill of skills) {
    const list = skillsByEmployee.get(skill.employeeId) ?? [];
    list.push({ taskId: skill.taskId, status: skill.status as SkillStatus });
    skillsByEmployee.set(skill.employeeId, list);
  }

  const yesterdayByEmployee = new Map<string, string[]>();
  for (const block of yesterdayBlocks) {
    const list = yesterdayByEmployee.get(block.employeeId) ?? [];
    list.push(block.taskId);
    yesterdayByEmployee.set(block.employeeId, list);
  }

  const employees: EmployeeContext[] = schedules
    .filter((schedule) => !absentEmployeeIds.has(schedule.employee.id))
    .map((schedule) => ({
      id: schedule.employee.id,
      name: schedule.employee.name,
      startMinutes: timeToMinutes(schedule.startTime),
      endMinutes: timeToMinutes(schedule.endTime),
      skills: skillsByEmployee.get(schedule.employee.id) ?? [],
      yesterdayTaskIds: yesterdayByEmployee.get(schedule.employee.id) ?? [],
    }));

  // On ne compte qu'une occurrence par jour civil, même si une tâche a été découpée en plusieurs blocs ce jour-là.
  const countedDaysPerPair = new Set<string>();
  const countByEmployeeTask = new Map<string, number>();
  for (const block of equityBlocks) {
    const dayKey = block.date.toISOString().slice(0, 10);
    const dedupeKey = `${block.employeeId}:${block.taskId}:${dayKey}`;
    if (countedDaysPerPair.has(dedupeKey)) continue;
    countedDaysPerPair.add(dedupeKey);
    const key = `${block.employeeId}:${block.taskId}`;
    countByEmployeeTask.set(key, (countByEmployeeTask.get(key) ?? 0) + 1);
  }

  const trainedEmployeeIdsByTask = new Map<string, Set<string>>();
  for (const skill of skills) {
    if (skill.status !== "FORME" && skill.status !== "REFERENT") continue;
    const set = trainedEmployeeIdsByTask.get(skill.taskId) ?? new Set<string>();
    set.add(skill.employeeId);
    trainedEmployeeIdsByTask.set(skill.taskId, set);
  }

  const teamAverageByTask = new Map<string, number>();
  for (const task of tasks) {
    const trained = trainedEmployeeIdsByTask.get(task.id);
    if (!trained || trained.size === 0) {
      teamAverageByTask.set(task.id, 0);
      continue;
    }
    let total = 0;
    for (const employeeId of trained) {
      total += countByEmployeeTask.get(`${employeeId}:${task.id}`) ?? 0;
    }
    teamAverageByTask.set(task.id, total / trained.size);
  }

  const equity: EquityStats = { countByEmployeeTask, teamAverageByTask };

  const taskContexts: TaskContext[] = tasks.map((task) => ({
    id: task.id,
    name: task.name,
    priorityRank: task.priorityRank,
    allowedSlot: task.allowedSlot as AllowedSlot,
    customStartMinutes: task.customStartTime ? timeToMinutes(task.customStartTime) : undefined,
    customEndMinutes: task.customEndTime ? timeToMinutes(task.customEndTime) : undefined,
    maxContinuousMinutes: task.maxContinuousMinutes,
    minStaff: task.minStaff,
    targetStaff: task.targetStaff,
    maxStaff: task.maxStaff,
    maxTraineeSlots: task.maxTraineeSlots,
    requiresTraining: task.requiresTraining,
  }));

  return {
    date,
    employees,
    tasks: taskContexts,
    equity,
    morningEndMinutes: timeToMinutes(MORNING_END_TIME),
    afternoonEndMinutes: timeToMinutes(AFTERNOON_END_TIME),
  };
}
