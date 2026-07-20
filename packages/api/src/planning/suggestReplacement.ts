import { prisma } from "../db.js";
import { loadDayContext } from "./loadDayContext.js";
import { pickReplacement } from "./pickReplacement.js";
import { parseDateOnly, timeToMinutes } from "./time.js";

export interface ReplacementSuggestion {
  taskId: string;
  taskName: string;
  startTime: string;
  endTime: string;
  suggestedReplacementUserId: string | null;
  suggestedReplacementName: string | null;
  reason: string;
}

export async function suggestReplacements(
  organizationId: string,
  absentEmployeeId: string,
  date: string
): Promise<ReplacementSuggestion[]> {
  const day = parseDateOnly(date);

  const vacantBlocks = await prisma.planningBlock.findMany({
    where: { employeeId: absentEmployeeId, date: day, task: { organizationId } },
    include: { task: true },
    orderBy: { startTime: "asc" },
  });
  if (vacantBlocks.length === 0) return [];

  const [context, todayBlocks] = await Promise.all([
    loadDayContext(organizationId, date),
    prisma.planningBlock.findMany({ where: { date: day, task: { organizationId } } }),
  ]);

  const busyRangesByEmployee = new Map<string, { start: number; end: number }[]>();
  for (const block of todayBlocks) {
    if (block.employeeId === absentEmployeeId) continue;
    const list = busyRangesByEmployee.get(block.employeeId) ?? [];
    list.push({ start: timeToMinutes(block.startTime), end: timeToMinutes(block.endTime) });
    busyRangesByEmployee.set(block.employeeId, list);
  }

  const employeeNames = new Map(context.employees.map((e) => [e.id, e.name]));

  return vacantBlocks.map((vacant) => {
    const task = context.tasks.find((t) => t.id === vacant.taskId);
    const segment = { start: timeToMinutes(vacant.startTime), end: timeToMinutes(vacant.endTime) };
    const replacement = task
      ? pickReplacement(absentEmployeeId, task, segment, context.employees, busyRangesByEmployee, context.equity)
      : null;

    // Réserve immédiatement le créneau du candidat choisi pour ne pas le suggérer deux fois
    // sur un autre poste vacant du même jour.
    if (replacement) {
      const list = busyRangesByEmployee.get(replacement.id) ?? [];
      list.push(segment);
      busyRangesByEmployee.set(replacement.id, list);
    }

    return {
      taskId: vacant.taskId,
      taskName: vacant.task.name,
      startTime: vacant.startTime,
      endTime: vacant.endTime,
      suggestedReplacementUserId: replacement?.id ?? null,
      suggestedReplacementName: replacement ? employeeNames.get(replacement.id) ?? null : null,
      reason: replacement
        ? "Formé, disponible sur ce créneau, rotation et équité respectées."
        : "Aucun remplaçant disponible (formation, disponibilité ou planning déjà chargé).",
    };
  });
}
