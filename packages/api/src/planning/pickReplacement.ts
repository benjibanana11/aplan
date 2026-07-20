import { timeRangesOverlap } from "./time.js";
import { isTrained, rankByRotationThenEquity } from "./rules.js";
import type { EmployeeContext, EquityStats, TaskContext } from "./types.js";

interface Segment {
  start: number;
  end: number;
}

/**
 * Picks the best replacement for a single vacant block, reusing the same eligibility
 * (trained, working, not double-booked) and ranking (rotation then equity) rules as the
 * main planning engine — just applied to one task/slot instead of a whole day.
 */
export function pickReplacement(
  absentEmployeeId: string,
  task: TaskContext,
  block: Segment,
  employees: EmployeeContext[],
  busyRangesByEmployee: Map<string, Segment[]>,
  equity: EquityStats
): EmployeeContext | null {
  const candidates = employees.filter((e) => {
    if (e.id === absentEmployeeId) return false;
    if (e.startMinutes > block.start || e.endMinutes < block.end) return false;
    if (!isTrained(e, task)) return false;
    const busy = busyRangesByEmployee.get(e.id) ?? [];
    return !busy.some((b) => timeRangesOverlap(b.start, b.end, block.start, block.end));
  });

  const ranked = rankByRotationThenEquity(candidates, task.id, equity);
  return ranked[0] ?? null;
}
