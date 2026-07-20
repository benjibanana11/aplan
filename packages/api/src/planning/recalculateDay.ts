import { prisma } from "../db.js";
import { loadDayContext } from "./loadDayContext.js";
import { generatePlanning } from "./planningEngine.js";
import { parseDateOnly } from "./time.js";

/**
 * Re-runs the planning engine for `date` and replaces its persisted blocks, but only if a plan
 * already existed for that day — declaring an absence for a day nobody has generated/validated yet
 * has nothing to recalculate (the next manual "Générer" will naturally exclude the absentee).
 * New blocks are flagged `needsRevalidation` so the admin sees the plan as "à valider" again,
 * even though it was persisted automatically.
 */
export async function recalculateDayIfPlanned(organizationId: string, date: string): Promise<boolean> {
  const day = parseDateOnly(date);
  const existingCount = await prisma.planningBlock.count({ where: { date: day, task: { organizationId } } });
  if (existingCount === 0) return false;

  const context = await loadDayContext(organizationId, date);
  const result = generatePlanning(context);

  await prisma.$transaction([
    prisma.planningBlock.deleteMany({ where: { date: day, task: { organizationId } } }),
    prisma.planningBlock.createMany({
      data: result.blocks.map((b) => ({
        employeeId: b.employeeId,
        taskId: b.taskId,
        date: day,
        startTime: b.startTime,
        endTime: b.endTime,
        source: "GENERATED",
        justification: b.justification,
        isTraining: b.isTraining,
        trainerName: b.trainerName,
        needsRevalidation: true,
      })),
    }),
  ]);

  return true;
}
