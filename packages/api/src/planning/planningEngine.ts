import { minutesToTime, timeRangesOverlap } from "./time.js";
import { equityScore, findSkill, isTrained, rankByRotationThenEquity } from "./rules.js";
import type {
  DayContext,
  EmployeeContext,
  PlanningAlert,
  PlanningResult,
  ProposedBlock,
  StaffingBand,
  TaskContext,
} from "./types.js";

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
 * Full-day staffing regions for a task: its explicit bands, with any uncovered stretch of the day
 * (before the first band, between two bands, or after the last band) filled in using the task's
 * flat min/target/max — the "default" staffing level for hours nobody defined a band for. A task
 * with no bands at all is just one region spanning the whole day.
 */
function regionsForTask(task: TaskContext): StaffingBand[] {
  const fallback = { minStaff: task.minStaff, targetStaff: task.targetStaff, maxStaff: task.maxStaff };
  if (task.staffingBands.length === 0) {
    return [{ startMinutes: 0, endMinutes: DAY_MINUTES, ...fallback }];
  }
  const sorted = [...task.staffingBands].sort((a, b) => a.startMinutes - b.startMinutes);
  const regions: StaffingBand[] = [];
  let cursor = 0;
  for (const band of sorted) {
    if (cursor < band.startMinutes) {
      regions.push({ startMinutes: cursor, endMinutes: band.startMinutes, ...fallback });
    }
    regions.push(band);
    cursor = band.endMinutes;
  }
  if (cursor < DAY_MINUTES) {
    regions.push({ startMinutes: cursor, endMinutes: DAY_MINUTES, ...fallback });
  }
  return regions;
}

/** A task's nominal (pre-cascade) peak concurrent target — the single "how many people does this
 * task want at its busiest moment" number used for cross-task cascading, across its bands AND
 * whatever hours default to its flat targetStaff. */
function nominalTarget(task: TaskContext): number {
  return Math.max(...regionsForTask(task).map((r) => r.targetStaff));
}

function nominalMax(task: TaskContext): number {
  return Math.max(...regionsForTask(task).map((r) => r.maxStaff));
}

/** The floor below which applyCascade must never reduce a task's target — the minStaff of
 * whichever region carries the peak target. */
function nominalMin(task: TaskContext): number {
  const regions = regionsForTask(task);
  const peak = Math.max(...regions.map((r) => r.targetStaff));
  const peakRegions = regions.filter((r) => r.targetStaff === peak);
  return Math.max(...peakRegions.map((r) => r.minStaff));
}

function findRegion(regions: StaffingBand[], minute: number): StaffingBand | undefined {
  return regions.find((r) => minute >= r.startMinutes && minute < r.endMinutes);
}

function intersect(a: Segment, b: Segment): Segment | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return start < end ? { start, end } : null;
}

/**
 * Merges every employee's scheduled shift for the day into the smallest set of disjoint
 * intervals — the actual hours someone from the team is present at all. Used to keep minStaff
 * alerts scoped to hours the team could conceivably staff: a task's nominal day-wide region (or a
 * gap region defaulting to the flat min/target/max) can span hours nobody is even scheduled to
 * work, and reporting a "deficit" there would just be noise about a structurally impossible slot,
 * not a real staffing problem.
 */
function teamCoverage(employees: EmployeeContext[]): Segment[] {
  const sorted = employees
    .map((e) => ({ start: e.startMinutes, end: e.endMinutes }))
    .filter((s) => s.start < s.end)
    .sort((a, b) => a.start - b.start);
  const merged: Segment[] = [];
  for (const seg of sorted) {
    const last = merged[merged.length - 1];
    if (last && seg.start <= last.end) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

/**
 * Builds a per-minute capacity function for one tier of a task's staffing requirement.
 * `tier: "targetStaff"` caps the main assignment pass; `tier: "maxStaff"` caps the leftover-time
 * complement pass (which is allowed to go beyond target, up to max, but ignores cascade). Hours not
 * covered by any explicit band fall back to the task's flat min/target/max (see `regionsForTask`).
 * `reduceBy` is the absolute headcount trim from applyCascade (0 for the max tier, which cascade
 * never touches); applied per region, never below that region's own minimum.
 */
function bandedCapacityAt(
  task: TaskContext,
  tier: "targetStaff" | "maxStaff",
  reduceBy: number
): (minute: number) => number {
  const regions = regionsForTask(task);
  return (minute: number) => {
    const region = findRegion(regions, minute);
    if (!region) return 0;
    const base = tier === "targetStaff" ? region.targetStaff : region.maxStaff;
    return tier === "targetStaff" ? Math.max(region.minStaff, base - reduceBy) : base;
  };
}

/**
 * Tracks how many people are concurrently occupying a task at each minute of the day, so
 * min/target/max staffing can be enforced as "at the same time", not as a running daily total.
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
   * stays under `capacityAt(minute)` for its whole length and is no longer than `maxDuration`
   * minutes. If that window is shorter than `minDuration`, keeps scanning forward within `segment`
   * for a later window that's long enough, rather than giving up on the whole segment — a short
   * gap at the start of an otherwise-wide-open segment shouldn't block a valid placement further in.
   * Returns null if no window satisfying `minDuration` exists anywhere in `segment`.
   */
  findWindow(
    taskId: string,
    segment: Segment,
    capacityAt: (minute: number) => number,
    maxDuration: number,
    minDuration = 0
  ): Segment | null {
    const arr = this.array(taskId);
    let searchStart = segment.start;
    while (searchStart < segment.end) {
      let start = -1;
      for (let m = searchStart; m < segment.end; m++) {
        if (arr[m] < capacityAt(m)) {
          start = m;
          break;
        }
      }
      if (start === -1) return null;
      const cap = Math.min(segment.end, start + maxDuration);
      let end = start;
      while (end < cap && arr[end] < capacityAt(end)) end++;
      if (end - start >= minDuration) return { start, end };
      searchStart = end;
    }
    return null;
  }

  /** Whether `segment` stays fully under `capacityAt` for its entire length (no partial fit). */
  hasRoom(taskId: string, segment: Segment, capacityAt: (minute: number) => number): boolean {
    const arr = this.array(taskId);
    for (let m = segment.start; m < segment.end; m++) {
      if (arr[m] >= capacityAt(m)) return false;
    }
    return true;
  }

  reserve(taskId: string, segment: Segment) {
    const arr = this.array(taskId);
    for (let m = segment.start; m < segment.end; m++) arr[m]++;
  }

  /** Peak concurrent occupancy within [start, end) — used to check minStaff per staffing region. */
  peakOccupancy(taskId: string, start: number, end: number): number {
    const arr = this.counts.get(taskId);
    if (!arr) return 0;
    let max = 0;
    for (let m = start; m < end; m++) if (arr[m] > max) max = arr[m];
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
  const effective = new Map(tasks.map((t) => [t.id, nominalTarget(t)]));
  const totalTarget = tasks.reduce((sum, t) => sum + nominalTarget(t), 0);
  let deficit = totalTarget - headcount;
  if (deficit <= 0) return effective;

  const byAscendingImportance = [...tasks].sort((a, b) => b.priorityRank - a.priorityRank);
  for (const task of byAscendingImportance) {
    if (deficit <= 0) break;
    const current = effective.get(task.id)!;
    const reducible = current - nominalMin(task);
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
  // Segment(s) each employee actually ended up placed on, across every task — used to find which
  // assigned employee genuinely overlaps a trainee's placed block (see doublonnage below).
  const assignedSegments = new Map<string, Segment[]>(context.employees.map((e) => [e.id, []]));

  const sortedTasks = [...context.tasks].sort((a, b) => a.priorityRank - b.priorityRank);
  const effectiveTargets = applyCascade(context.tasks, context.employees.length);
  const slotBoundaries: SlotBoundaries = {
    morningEndMinutes: context.morningEndMinutes,
    afternoonEndMinutes: context.afternoonEndMinutes,
  };

  /** Tries to place `employee` on `task` somewhere within one of their free segments, respecting
   * the task's slot window, per-minute capacity ceiling, minimum/maximum continuous duration. On
   * success, the consumed segment is split into its leftover before/after pieces (if any) so time
   * on either side of the placed block stays available for later passes, and `describe` is called
   * with the actually-placed segment to produce the block's justification/training fields (called
   * only after placement, since e.g. the trainee doublonnage pass can only know who's really
   * supervising once it knows exactly when the trainee landed). Returns the placed segment, or
   * null if no free segment could fit it. */
  function tryAddBlock(
    employee: EmployeeContext,
    task: TaskContext,
    occupancy: Occupancy,
    capacityAt: (minute: number) => number,
    minDuration: number,
    describe: (placed: Segment) => { justification: string; isTraining: boolean; trainerName: string | null }
  ): Segment | null {
    const segments = remaining.get(employee.id)!;
    for (let i = 0; i < segments.length; i++) {
      const windowSeg = clipToTaskWindow(task, segments[i], slotBoundaries);
      if (!windowSeg) continue;
      // Créneau CUSTOM : la plage est exigée exacte (début et fin imposés), donc pas de recherche
      // glissante — soit toute la plage est libre, soit l'affectation échoue.
      const avail =
        task.allowedSlot === "CUSTOM"
          ? occupancy.hasRoom(task.id, windowSeg, capacityAt)
            ? windowSeg
            : null
          : occupancy.findWindow(task.id, windowSeg, capacityAt, task.maxContinuousMinutes, minDuration);
      if (!avail) continue;

      occupancy.reserve(task.id, avail);
      const { justification, isTraining, trainerName } = describe(avail);
      blocks.push({
        employeeId: employee.id,
        taskId: task.id,
        startTime: minutesToTime(avail.start),
        endTime: minutesToTime(avail.end),
        justification,
        isTraining,
        trainerName,
      });
      assignedTasksToday.get(employee.id)!.add(task.id);
      assignedSegments.get(employee.id)!.push(avail);

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
    const target = Math.min(effectiveTargets.get(task.id) ?? nominalTarget(task), nominalMax(task));
    if (target <= 0) continue;
    // Trim (jamais négatif) appliqué par la cascade au-dessus, à répercuter par tranche.
    const reduceBy = Math.max(0, nominalTarget(task) - target);
    const mainCapacityAt = bandedCapacityAt(task, "targetStaff", reduceBy);

    const pool = context.employees.filter((e) => {
      if (assignedTasksToday.get(e.id)!.has(task.id)) return false;
      if (!hasUsableWindow(e, task)) return false;
      return isTrained(e, task);
    });

    const ordered = rankByRotationThenEquity(pool, task.id, context.equity);

    const assigned: EmployeeContext[] = [];
    for (const employee of ordered) {
      const rotatedFromYesterday = employee.yesterdayTaskIds.includes(task.id);
      const rotationNote = rotatedFromYesterday
        ? "rotation : aucune alternative disponible, tâche identique à hier"
        : "rotation respectée";
      const score = equityScore(employee.id, task.id, context.equity);
      const equityNote = `équité ${score >= 0 ? "+" : ""}${score.toFixed(1)} vs moyenne équipe`;
      const placed = tryAddBlock(employee, task, staffOccupancy, mainCapacityAt, task.minContinuousMinutes, () => ({
        justification: `Formé sur "${task.name}" (${rotationNote}, ${equityNote}).`,
        isTraining: false,
        trainerName: null,
      }));
      if (placed) assigned.push(employee);
    }

    if (task.maxTraineeSlots > 0 && assigned.length > 0) {
      // Un stagiaire ne peut être placé qu'aux minutes où un employé formé/référent affecté à cette
      // tâche est réellement présent (pas juste "quelqu'un l'est quelque part dans la journée") —
      // sinon avec des tranches à effectif variable, un référent du matin se retrouverait crédité
      // comme encadrant un stagiaire placé le soir alors qu'il n'est plus là.
      const traineeCapacityAt = (minute: number) => {
        const hasSupervisorPresent = assigned.some((e) =>
          assignedSegments.get(e.id)!.some((seg) => minute >= seg.start && minute < seg.end)
        );
        return hasSupervisorPresent ? task.maxTraineeSlots : 0;
      };
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
          traineeCapacityAt,
          task.minContinuousMinutes,
          (placed) => {
            const overlapping = assigned.filter((partner) =>
              assignedSegments.get(partner.id)!.some((seg) => timeRangesOverlap(seg.start, seg.end, placed.start, placed.end))
            );
            const referentPartner = overlapping.find((e) => findSkill(e, task.id)?.status === "REFERENT");
            const formedPartner = overlapping.find((e) => findSkill(e, task.id)?.status === "FORME");
            const partner = referentPartner ?? formedPartner ?? overlapping[0];
            const pairingLabel = referentPartner ? "référent" : "employé formé";
            return {
              justification: `En formation sur "${task.name}", encadré(e) par ${partner?.name ?? "un " + pairingLabel} (${pairingLabel}).`,
              isTraining: true,
              trainerName: partner?.name ?? null,
            };
          }
        );
      }
    }
  }

  // Deuxième passe : le temps restant est comblé par n'importe quelle tâche déjà maîtrisée,
  // toujours par ordre de priorité, jusqu'au max (pas la cible) de chaque tranche horaire. Un
  // employé peut avoir plusieurs plages libres disjointes (ex: un créneau CUSTOM au milieu de la
  // journée a laissé du temps libre avant ET après) ; on boucle jusqu'à ce qu'aucune tâche ne
  // puisse plus combler aucune des plages restantes, pas juste la première trouvée.
  for (const employee of context.employees) {
    let progress = true;
    while (progress) {
      progress = false;
      if (remaining.get(employee.id)!.length === 0) break;
      for (const task of sortedTasks) {
        if (assignedTasksToday.get(employee.id)!.has(task.id)) continue;
        if (!isTrained(employee, task)) continue;
        if (!hasUsableWindow(employee, task)) continue;
        const maxCapacityAt = bandedCapacityAt(task, "maxStaff", 0);
        const placed = tryAddBlock(employee, task, staffOccupancy, maxCapacityAt, task.minContinuousMinutes, () => ({
          justification: `Complément de journée sur une tâche déjà maîtrisée ("${task.name}").`,
          isTraining: false,
          trainerName: null,
        }));
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
  // peut encore compléter l'effectif d'une tâche), sur le pic de personnes réellement en même temps
  // — une par tranche horaire pour une tâche qui en a, sinon une seule pour toute sa journée, pour
  // qu'un déficit du soir ne reste jamais masqué par un excédent du matin. Chaque région est en
  // plus recadrée sur les heures où l'équipe est réellement présente (teamCoverage) : hors de tout
  // horaire d'employé, un "déficit" n'en est pas un — personne ne peut de toute façon y être affecté.
  const coverage = teamCoverage(context.employees);
  for (const task of sortedTasks) {
    const target = Math.min(effectiveTargets.get(task.id) ?? nominalTarget(task), nominalMax(task));
    const reduceBy = Math.max(0, nominalTarget(task) - target);
    const regions = regionsForTask(task).map((region) => ({
      startMinutes: region.startMinutes,
      endMinutes: region.endMinutes,
      minStaff: region.minStaff,
      effectiveTarget: Math.max(region.minStaff, region.targetStaff - reduceBy),
    }));

    for (const region of regions) {
      for (const cov of coverage) {
        const overlap = intersect({ start: region.startMinutes, end: region.endMinutes }, cov);
        if (!overlap) continue;
        const peak = staffOccupancy.peakOccupancy(task.id, overlap.start, overlap.end);
        if (peak < region.minStaff) {
          alerts.push({
            taskId: task.id,
            taskName: task.name,
            message: `Effectif minimum non atteint de ${minutesToTime(overlap.start)} à ${minutesToTime(overlap.end)} : ${peak}/${region.minStaff} personnes en même temps (cible ${region.effectiveTarget}).`,
          });
        }
      }
    }
  }

  return { blocks, alerts };
}
