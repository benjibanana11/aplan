import { minutesToTime } from "./time.js";
import { equityScore, findSkill, isTrained, rankByRotationThenEquity } from "./rules.js";
import type { DayContext, EmployeeContext, PlanningAlert, PlanningResult, ProposedBlock, TaskContext } from "./types.js";

interface Segment {
  start: number;
  end: number;
}

const DAY_MINUTES = 24 * 60;

interface SlotBoundaries {
  morningEndMinutes: number;
  afternoonEndMinutes: number;
}

/**
 * Clips `segment` (an employee's available time) to `task`'s allowed slot.
 * MORNING/AFTERNOON/EVENING/ALL_DAY are indicative ranges: any overlap with `segment` is usable.
 * CUSTOM is a strict requirement: the task must run exactly from `customStartMinutes` to
 * `customEndMinutes`, so it's only usable when `segment` fully covers that exact range —
 * no partial overlap, no shifted start/end.
 */
function clipToTaskWindow(task: TaskContext, segment: Segment, boundaries: SlotBoundaries): Segment | null {
  if (task.allowedSlot === "CUSTOM") {
    const start = task.customStartMinutes ?? 0;
    const end = task.customEndMinutes ?? DAY_MINUTES;
    return segment.start <= start && segment.end >= end ? { start, end } : null;
  }

  let windowStart = 0;
  let windowEnd = DAY_MINUTES;
  if (task.allowedSlot === "MORNING") {
    windowEnd = boundaries.morningEndMinutes;
  } else if (task.allowedSlot === "AFTERNOON") {
    windowStart = boundaries.morningEndMinutes;
    windowEnd = boundaries.afternoonEndMinutes;
  } else if (task.allowedSlot === "EVENING") {
    windowStart = boundaries.afternoonEndMinutes;
  }
  const start = Math.max(segment.start, windowStart);
  const end = Math.min(segment.end, windowEnd);
  return start < end ? { start, end } : null;
}

/**
 * Tracks how many people are concurrently occupying a task at each minute of the day, so
 * `minStaff`/`maxStaff` can be enforced as "at the same time", not as a running daily total.
 */
class Occupancy {
  private counts = new Map<string, Int16Array>();

  private array(taskId: string): Int16Array {
    let arr = this.counts.get(taskId);
    if (!arr) {
      arr = new Int16Array(DAY_MINUTES);
      this.counts.set(taskId, arr);
    }
    return arr;
  }

  /**
   * Largest sub-segment of `segment`, starting at the earliest minute with spare capacity, that
   * stays under `capacity` for its whole length and is no longer than `maxDuration` minutes.
   * Returns null if there is no room anywhere in `segment`.
   */
  findWindow(taskId: string, segment: Segment, capacity: number, maxDuration: number): Segment | null {
    if (capacity <= 0) return null;
    const arr = this.array(taskId);
    let start = -1;
    for (let m = segment.start; m < segment.end; m++) {
      if (arr[m] < capacity) {
        start = m;
        break;
      }
    }
    if (start === -1) return null;
    const cap = Math.min(segment.end, start + maxDuration);
    let end = start;
    while (end < cap && arr[end] < capacity) end++;
    return { start, end };
  }

  /** Whether `segment` stays fully under `capacity` for its entire length (no partial fit). */
  hasRoom(taskId: string, segment: Segment, capacity: number): boolean {
    if (capacity <= 0) return false;
    const arr = this.array(taskId);
    for (let m = segment.start; m < segment.end; m++) {
      if (arr[m] >= capacity) return false;
    }
    return true;
  }

  reserve(taskId: string, segment: Segment) {
    const arr = this.array(taskId);
    for (let m = segment.start; m < segment.end; m++) arr[m]++;
  }

  maxOccupancy(taskId: string): number {
    const arr = this.counts.get(taskId);
    if (!arr) return 0;
    let max = 0;
    for (const v of arr) if (v > max) max = v;
    return max;
  }
}

/**
 * Reduces each task's target headcount, starting from the least important task, until the
 * total no longer exceeds the day's available headcount. Never reduces below a task's minimum.
 * This is a coarse daily-headcount sanity check (a team of 3 can't cover two tasks that each
 * need 2 people concurrently) — the real "at the same time" ceiling is enforced by `Occupancy`.
 */
function applyCascade(tasks: TaskContext[], headcount: number): Map<string, number> {
  const effective = new Map(tasks.map((t) => [t.id, t.targetStaff]));
  const totalTarget = tasks.reduce((sum, t) => sum + t.targetStaff, 0);
  let deficit = totalTarget - headcount;
  if (deficit <= 0) return effective;

  const byAscendingImportance = [...tasks].sort((a, b) => b.priorityRank - a.priorityRank);
  for (const task of byAscendingImportance) {
    if (deficit <= 0) break;
    const current = effective.get(task.id)!;
    const reducible = current - task.minStaff;
    if (reducible <= 0) continue;
    const reduceBy = Math.min(reducible, deficit);
    effective.set(task.id, current - reduceBy);
    deficit -= reduceBy;
  }
  return effective;
}

export function generatePlanning(context: DayContext): PlanningResult {
  const blocks: ProposedBlock[] = [];
  const alerts: PlanningAlert[] = [];
  const staffOccupancy = new Occupancy();
  const traineeOccupancy = new Occupancy();

  // Chaque employé peut avoir plusieurs plages libres disjointes (pas une seule qui s'étend en
  // continu) : un bloc placé au milieu de la journée (créneau CUSTOM, ou capacité déjà pleine plus
  // tôt) fractionne la plage restante en deux au lieu d'écraser tout ce qui précède.
  const remaining = new Map<string, Segment[]>(
    context.employees.map((e) => [e.id, [{ start: e.startMinutes, end: e.endMinutes }]])
  );

  /** Whether `employee` has any free segment where `task` could conceivably run (ignoring current
   * occupancy — capacity is checked later by `tryAddBlock`). Used for pool/eligibility filtering. */
  function hasUsableWindow(employee: EmployeeContext, task: TaskContext): boolean {
    return remaining.get(employee.id)!.some((seg) => clipToTaskWindow(task, seg, slotBoundaries) !== null);
  }
  const assignedTasksToday = new Map<string, Set<string>>(context.employees.map((e) => [e.id, new Set()]));

  const sortedTasks = [...context.tasks].sort((a, b) => a.priorityRank - b.priorityRank);
  const effectiveTargets = applyCascade(context.tasks, context.employees.length);
  const slotBoundaries: SlotBoundaries = {
    morningEndMinutes: context.morningEndMinutes,
    afternoonEndMinutes: context.afternoonEndMinutes,
  };

  /** Tries to place `employee` on `task` somewhere within one of their free segments, respecting
   * the task's slot window, concurrent-capacity ceiling, and max continuous duration. On success,
   * the consumed segment is split into its leftover before/after pieces (if any) so time on either
   * side of the placed block stays available for later passes. Returns the placed segment, or null
   * if no free segment could fit it. */
  function tryAddBlock(
    employee: EmployeeContext,
    task: TaskContext,
    occupancy: Occupancy,
    capacity: number,
    justification: string,
    training: { trainerName: string | null } | null = null
  ): Segment | null {
    const segments = remaining.get(employee.id)!;
    for (let i = 0; i < segments.length; i++) {
      const windowSeg = clipToTaskWindow(task, segments[i], slotBoundaries);
      if (!windowSeg) continue;
      // Créneau CUSTOM : la plage est exigée exacte (début et fin imposés), donc pas de recherche
      // glissante — soit toute la plage est libre, soit l'affectation échoue.
      const avail =
        task.allowedSlot === "CUSTOM"
          ? occupancy.hasRoom(task.id, windowSeg, capacity)
            ? windowSeg
            : null
          : occupancy.findWindow(task.id, windowSeg, capacity, task.maxContinuousMinutes);
      if (!avail) continue;

      occupancy.reserve(task.id, avail);
      blocks.push({
        employeeId: employee.id,
        taskId: task.id,
        startTime: minutesToTime(avail.start),
        endTime: minutesToTime(avail.end),
        justification,
        isTraining: training !== null,
        trainerName: training?.trainerName ?? null,
      });
      assignedTasksToday.get(employee.id)!.add(task.id);

      const original = segments[i];
      const leftoverPieces: Segment[] = [];
      if (original.start < avail.start) leftoverPieces.push({ start: original.start, end: avail.start });
      if (avail.end < original.end) leftoverPieces.push({ start: avail.end, end: original.end });
      segments.splice(i, 1, ...leftoverPieces);
      return avail;
    }
    return null;
  }

  for (const task of sortedTasks) {
    const target = Math.min(effectiveTargets.get(task.id) ?? task.targetStaff, task.maxStaff);
    if (target <= 0) continue;

    const pool = context.employees.filter((e) => {
      if (assignedTasksToday.get(e.id)!.has(task.id)) return false;
      if (!hasUsableWindow(e, task)) return false;
      return isTrained(e, task);
    });

    const ordered = rankByRotationThenEquity(pool, task.id, context.equity);

    const assigned: EmployeeContext[] = [];
    for (const employee of ordered) {
      if (assigned.length >= target) break;
      const rotatedFromYesterday = employee.yesterdayTaskIds.includes(task.id);
      const rotationNote = rotatedFromYesterday
        ? "rotation : aucune alternative disponible, tâche identique à hier"
        : "rotation respectée";
      const score = equityScore(employee.id, task.id, context.equity);
      const equityNote = `équité ${score >= 0 ? "+" : ""}${score.toFixed(1)} vs moyenne équipe`;
      const placed = tryAddBlock(
        employee,
        task,
        staffOccupancy,
        task.maxStaff,
        `Formé sur "${task.name}" (${rotationNote}, ${equityNote}).`
      );
      if (placed) assigned.push(employee);
    }

    if (task.maxTraineeSlots > 0 && assigned.length > 0) {
      const hasReferent = assigned.some((e) => findSkill(e, task.id)?.status === "REFERENT");
      const referentPartner = assigned.find((e) => findSkill(e, task.id)?.status === "REFERENT");
      const formedPartner = assigned.find((e) => findSkill(e, task.id)?.status === "FORME");
      const partner = referentPartner ?? formedPartner;
      const pairingLabel = hasReferent ? "référent" : "employé formé";
      const trainees = context.employees.filter((e) => {
        if (assignedTasksToday.get(e.id)!.has(task.id)) return false;
        if (!hasUsableWindow(e, task)) return false;
        return findSkill(e, task.id)?.status === "EN_FORMATION";
      });
      for (const trainee of trainees) {
        tryAddBlock(
          trainee,
          task,
          traineeOccupancy,
          task.maxTraineeSlots,
          `En formation sur "${task.name}", encadré(e) par ${partner?.name ?? "un " + pairingLabel} (${pairingLabel}).`,
          { trainerName: partner?.name ?? null }
        );
      }
    }
  }

  // Deuxième passe : le temps restant est comblé par n'importe quelle tâche déjà maîtrisée,
  // toujours par ordre de priorité. Un employé peut avoir plusieurs plages libres disjointes
  // (ex: un créneau CUSTOM au milieu de la journée a laissé du temps libre avant ET après) ; on
  // boucle jusqu'à ce qu'aucune tâche ne puisse plus combler aucune des plages restantes, pas
  // juste la première trouvée.
  for (const employee of context.employees) {
    let progress = true;
    while (progress) {
      progress = false;
      if (remaining.get(employee.id)!.length === 0) break;
      for (const task of sortedTasks) {
        if (assignedTasksToday.get(employee.id)!.has(task.id)) continue;
        if (!isTrained(employee, task)) continue;
        if (!hasUsableWindow(employee, task)) continue;
        const placed = tryAddBlock(
          employee,
          task,
          staffOccupancy,
          task.maxStaff,
          `Complément de journée sur une tâche déjà maîtrisée ("${task.name}").`
        );
        if (placed) {
          progress = true;
          break;
        }
      }
    }
  }

  // Toute tâche (y compris "Encodage") est désormais mise en concurrence normalement selon sa
  // priorité, dans la passe principale et la deuxième passe ci-dessus — il n'y a plus de tâche
  // "par défaut" traitée à part. S'il reste du temps non affecté après ces deux passes, c'est
  // qu'aucune tâche (formation requise, capacité, créneau horaire...) ne pouvait l'occuper.
  const employeesWithLeftoverTime = new Set<string>();
  for (const employee of context.employees) {
    if (remaining.get(employee.id)!.length > 0) {
      employeesWithLeftoverTime.add(employee.id);
    }
  }
  if (employeesWithLeftoverTime.size > 0) {
    alerts.push({
      taskId: "",
      taskName: "—",
      message: `Aucune tâche disponible pour combler le temps restant : ${employeesWithLeftoverTime.size} employé(s) ont du temps non affecté.`,
    });
  }

  // Alertes d'effectif minimum : évaluées une fois toutes les passes terminées (la deuxième passe
  // peut encore compléter l'effectif d'une tâche), sur le pic de personnes réellement en même temps.
  for (const task of sortedTasks) {
    const target = Math.min(effectiveTargets.get(task.id) ?? task.targetStaff, task.maxStaff);
    const peak = staffOccupancy.maxOccupancy(task.id);
    if (peak < task.minStaff) {
      alerts.push({
        taskId: task.id,
        taskName: task.name,
        message: `Effectif minimum non atteint : ${peak}/${task.minStaff} personnes en même temps (cible ${target}).`,
      });
    }
  }

  return { blocks, alerts };
}
