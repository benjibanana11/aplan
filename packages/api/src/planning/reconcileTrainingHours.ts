import { prisma } from "../db.js";
import { timeToMinutes } from "./time.js";

interface TrainingBlockLike {
  employeeId: string;
  taskId: string;
  startTime: string;
  endTime: string;
  isTraining: boolean;
}

/**
 * Ajuste EmployeeTaskSkill.hoursCompleted pour refléter les blocs "en formation" d'un jour tel que
 * validé, de façon idempotente : re-valider le même jour plusieurs fois (retouche manuelle,
 * recalcul automatique suite à une absence) ne doit ni additionner ni perdre des heures — seul
 * l'écart avec la dernière validation connue de ce jour (TrainingHoursLog) est appliqué. N'agit que
 * sur les compétences encore au statut EN_FORMATION (une fois Formé/Référent, on ne suit plus les heures).
 */
export async function reconcileTrainingHours(teamId: string, date: Date, blocks: TrainingBlockLike[]) {
  const newHoursByKey = new Map<string, number>();
  for (const block of blocks) {
    if (!block.isTraining) continue;
    const key = `${block.employeeId}:${block.taskId}`;
    const hours = (timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) / 60;
    newHoursByKey.set(key, (newHoursByKey.get(key) ?? 0) + hours);
  }

  const existingLogs = await prisma.trainingHoursLog.findMany({ where: { teamId, date } });
  const logByKey = new Map(existingLogs.map((log) => [`${log.employeeId}:${log.taskId}`, log]));

  const keys = new Set([...newHoursByKey.keys(), ...logByKey.keys()]);

  for (const key of keys) {
    const [employeeId, taskId] = key.split(":");
    const newHours = newHoursByKey.get(key) ?? 0;
    const existingLog = logByKey.get(key);
    const delta = newHours - (existingLog?.hours ?? 0);

    if (delta !== 0) {
      const skill = await prisma.employeeTaskSkill.findUnique({ where: { employeeId_taskId: { employeeId, taskId } } });
      if (skill && skill.status === "EN_FORMATION") {
        await prisma.employeeTaskSkill.update({
          where: { employeeId_taskId: { employeeId, taskId } },
          data: { hoursCompleted: Math.max(0, skill.hoursCompleted + delta) },
        });
      }
    }

    if (newHours > 0) {
      await prisma.trainingHoursLog.upsert({
        where: { employeeId_taskId_date: { employeeId, taskId, date } },
        update: { hours: newHours },
        create: { employeeId, taskId, teamId, date, hours: newHours },
      });
    } else if (existingLog) {
      await prisma.trainingHoursLog.delete({ where: { id: existingLog.id } });
    }
  }
}
