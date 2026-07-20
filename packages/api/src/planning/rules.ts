import type { EmployeeContext, EquityStats, TaskContext } from "./types.js";

export function findSkill(employee: EmployeeContext, taskId: string) {
  return employee.skills.find((s) => s.taskId === taskId);
}

export function isTrained(employee: EmployeeContext, task: TaskContext): boolean {
  if (!task.requiresTraining) return true;
  const skill = findSkill(employee, task.id);
  return skill?.status === "FORME" || skill?.status === "REFERENT";
}

export function equityScore(employeeId: string, taskId: string, equity: EquityStats): number {
  const count = equity.countByEmployeeTask.get(`${employeeId}:${taskId}`) ?? 0;
  const average = equity.teamAverageByTask.get(taskId) ?? 0;
  return count - average;
}

/** Employees who didn't do this task yesterday first (rotation), each group ordered by lowest equity score (most "due") first. */
export function rankByRotationThenEquity(
  employees: EmployeeContext[],
  taskId: string,
  equity: EquityStats
): EmployeeContext[] {
  const notYesterday = employees.filter((e) => !e.yesterdayTaskIds.includes(taskId));
  const didYesterday = employees.filter((e) => e.yesterdayTaskIds.includes(taskId));
  const byEquity = (a: EmployeeContext, b: EmployeeContext) =>
    equityScore(a.id, taskId, equity) - equityScore(b.id, taskId, equity);
  notYesterday.sort(byEquity);
  didYesterday.sort(byEquity);
  return [...notYesterday, ...didYesterday];
}
