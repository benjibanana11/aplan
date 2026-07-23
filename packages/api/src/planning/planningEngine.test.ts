import { describe, expect, it } from "vitest";
import { generatePlanning } from "./planningEngine.js";
import { timeToMinutes } from "./time.js";
import { AFTERNOON_END, MORNING_END, emptyEquity, makeEmployee, makeTask } from "./testFixtures.js";
import type { DayContext, EquityStats } from "./types.js";

function makeContext(overrides: Partial<DayContext>): DayContext {
  return {
    date: "2026-07-20",
    employees: [],
    tasks: [],
    equity: emptyEquity(),
    morningEndMinutes: MORNING_END,
    afternoonEndMinutes: AFTERNOON_END,
    ...overrides,
  };
}

describe("generatePlanning", () => {
  it("assigns trained employees to their task up to target, with a justification", () => {
    const task = makeTask({ id: "t1", priorityRank: 1, targetStaff: 1, maxStaff: 1 });
    const employee = makeEmployee({ id: "e1", skills: [{ taskId: "t1", status: "FORME" }] });
    const context = makeContext({ employees: [employee], tasks: [task] });

    const result = generatePlanning(context);

    const block = result.blocks.find((b) => b.employeeId === "e1" && b.taskId === "t1");
    expect(block).toBeDefined();
    expect(block!.startTime).toBe("08:00");
    expect(block!.justification.length).toBeGreaterThan(0);
    expect(result.alerts).toHaveLength(0);
  });

  it("never force-assigns an untrained employee, and alerts when minStaff is unreachable", () => {
    const task = makeTask({ id: "t1", priorityRank: 1, minStaff: 1, targetStaff: 1 });
    const employee = makeEmployee({ id: "e1", skills: [] }); // not trained
    const context = makeContext({ employees: [employee], tasks: [task] });

    const result = generatePlanning(context);

    expect(result.blocks.some((b) => b.taskId === "t1")).toBe(false);
    expect(result.alerts).toContainEqual(
      expect.objectContaining({ taskId: "t1", message: expect.stringContaining("0/1") })
    );
  });

  it("cascades down the least-important task first when understaffed, never below its minimum", () => {
    // 2 employees available, but 3 tasks each wanting 1 (target sum = 3 > headcount = 2).
    const important = makeTask({ id: "important", priorityRank: 1, minStaff: 1, targetStaff: 1, maxStaff: 1 });
    const middle = makeTask({ id: "middle", priorityRank: 2, minStaff: 1, targetStaff: 1, maxStaff: 1 });
    const leastImportant = makeTask({ id: "least", priorityRank: 3, minStaff: 0, targetStaff: 1, maxStaff: 1 });
    const employees = [
      makeEmployee({
        id: "e1",
        skills: [
          { taskId: "important", status: "FORME" },
          { taskId: "middle", status: "FORME" },
          { taskId: "least", status: "FORME" },
        ],
      }),
      makeEmployee({
        id: "e2",
        skills: [
          { taskId: "important", status: "FORME" },
          { taskId: "middle", status: "FORME" },
          { taskId: "least", status: "FORME" },
        ],
      }),
    ];
    const context = makeContext({ employees, tasks: [important, middle, leastImportant] });

    const result = generatePlanning(context);

    expect(result.blocks.some((b) => b.taskId === "important")).toBe(true);
    expect(result.blocks.some((b) => b.taskId === "middle")).toBe(true);
    // The least important task's target was cascaded down to its minimum (0), so it should
    // receive nobody from the priority loop itself.
    const leastBlocksFromPriorityLoop = result.blocks.filter(
      (b) => b.taskId === "least" && b.justification.includes("Formé sur")
    );
    expect(leastBlocksFromPriorityLoop).toHaveLength(0);
  });

  it("prefers the employee who did NOT do this task yesterday (rotation over equity)", () => {
    const task = makeTask({ id: "t1", priorityRank: 1, targetStaff: 1, maxStaff: 1 });
    const employees = [
      makeEmployee({ id: "didYesterday", skills: [{ taskId: "t1", status: "FORME" }], yesterdayTaskIds: ["t1"] }),
      makeEmployee({ id: "fresh", skills: [{ taskId: "t1", status: "FORME" }] }),
    ];
    // Give "fresh" a worse equity score (higher count) so equity alone would favor "didYesterday" —
    // rotation should still win.
    const equity: EquityStats = {
      countByEmployeeTask: new Map([
        ["didYesterday:t1", 0],
        ["fresh:t1", 5],
      ]),
      teamAverageByTask: new Map([["t1", 2]]),
    };
    const context = makeContext({ employees, tasks: [task], equity });

    const result = generatePlanning(context);

    const assignee = result.blocks.find((b) => b.taskId === "t1")?.employeeId;
    expect(assignee).toBe("fresh");
  });

  it("falls back to the same-task-as-yesterday employee when no alternative is available", () => {
    const task = makeTask({ id: "t1", priorityRank: 1, targetStaff: 1, maxStaff: 1 });
    const employee = makeEmployee({ id: "onlyOne", skills: [{ taskId: "t1", status: "FORME" }], yesterdayTaskIds: ["t1"] });
    const context = makeContext({ employees: [employee], tasks: [task] });

    const result = generatePlanning(context);

    expect(result.blocks.find((b) => b.taskId === "t1")?.employeeId).toBe("onlyOne");
  });

  it("prioritizes the employee with the lower equity score among equally-rotation-eligible candidates", () => {
    const task = makeTask({ id: "t1", priorityRank: 1, targetStaff: 1, maxStaff: 1 });
    const employees = [
      makeEmployee({ id: "overdue", skills: [{ taskId: "t1", status: "FORME" }] }),
      makeEmployee({ id: "caughtUp", skills: [{ taskId: "t1", status: "FORME" }] }),
    ];
    const equity: EquityStats = {
      countByEmployeeTask: new Map([
        ["overdue:t1", 0],
        ["caughtUp:t1", 5],
      ]),
      teamAverageByTask: new Map([["t1", 3]]),
    };
    const context = makeContext({ employees, tasks: [task], equity });

    const result = generatePlanning(context);

    expect(result.blocks.find((b) => b.taskId === "t1")?.employeeId).toBe("overdue");
  });

  it("doubles a trainee with a present referent, preferring referent pairing over trained pairing", () => {
    const task = makeTask({ id: "t1", priorityRank: 1, targetStaff: 1, maxStaff: 1, maxTraineeSlots: 1 });
    const employees = [
      makeEmployee({ id: "referent", skills: [{ taskId: "t1", status: "REFERENT" }] }),
      makeEmployee({ id: "trainee", skills: [{ taskId: "t1", status: "EN_FORMATION" }] }),
    ];
    const context = makeContext({ employees, tasks: [task] });

    const result = generatePlanning(context);

    const traineeBlock = result.blocks.find((b) => b.employeeId === "trainee");
    expect(traineeBlock?.taskId).toBe("t1");
    expect(traineeBlock?.justification).toContain("référent");
    expect(traineeBlock?.isTraining).toBe(true);
    expect(traineeBlock?.trainerName).toBe("referent");

    const referentBlock = result.blocks.find((b) => b.employeeId === "referent");
    expect(referentBlock?.isTraining).toBe(false);
    expect(referentBlock?.trainerName).toBeNull();
  });

  it("does not double a trainee when no referent or trained employee is present on the task, and falls back to a known task", () => {
    const target = makeTask({ id: "target", priorityRank: 1, targetStaff: 0, maxStaff: 0, maxTraineeSlots: 1 });
    const known = makeTask({ id: "known", priorityRank: 2, targetStaff: 1, maxStaff: 1 });
    const trainee = makeEmployee({
      id: "trainee",
      skills: [
        { taskId: "target", status: "EN_FORMATION" },
        { taskId: "known", status: "FORME" },
      ],
    });
    const context = makeContext({ employees: [trainee], tasks: [target, known] });

    const result = generatePlanning(context);

    expect(result.blocks.some((b) => b.taskId === "target")).toBe(false);
    expect(result.blocks.some((b) => b.taskId === "known")).toBe(true);
  });

  it("splits a block across tasks when the shift exceeds a task's max continuous duration", () => {
    const first = makeTask({ id: "first", priorityRank: 1, maxContinuousMinutes: 120, targetStaff: 1, maxStaff: 1 });
    const second = makeTask({ id: "second", priorityRank: 2, maxContinuousMinutes: 480, targetStaff: 1, maxStaff: 1 });
    const employee = makeEmployee({
      id: "e1",
      startMinutes: timeToMinutes("08:00"),
      endMinutes: timeToMinutes("12:00"),
      skills: [
        { taskId: "first", status: "FORME" },
        { taskId: "second", status: "FORME" },
      ],
    });
    const context = makeContext({ employees: [employee], tasks: [first, second] });

    const result = generatePlanning(context);

    const firstBlock = result.blocks.find((b) => b.taskId === "first");
    const secondBlock = result.blocks.find((b) => b.taskId === "second");
    expect(firstBlock).toMatchObject({ startTime: "08:00", endTime: "10:00" });
    expect(secondBlock).toMatchObject({ startTime: "10:00", endTime: "12:00" });
  });

  it("only assigns a MORNING task for the morning portion of the shift, routing the afternoon elsewhere", () => {
    const morningTask = makeTask({ id: "morning", priorityRank: 1, allowedSlot: "MORNING", targetStaff: 1, maxStaff: 1 });
    const defaultTask = makeTask({ id: "default", priorityRank: 2, requiresTraining: false, targetStaff: 0, maxStaff: 99 });
    const employee = makeEmployee({
      id: "e1",
      startMinutes: timeToMinutes("08:00"),
      endMinutes: timeToMinutes("16:00"),
      skills: [{ taskId: "morning", status: "FORME" }],
    });
    const context = makeContext({
      employees: [employee],
      tasks: [morningTask, defaultTask],
      morningEndMinutes: timeToMinutes("13:00"),
    });

    const result = generatePlanning(context);

    const morningBlock = result.blocks.find((b) => b.taskId === "morning");
    const defaultBlock = result.blocks.find((b) => b.taskId === "default");
    expect(morningBlock).toMatchObject({ startTime: "08:00", endTime: "13:00" });
    expect(defaultBlock).toMatchObject({ startTime: "13:00", endTime: "16:00" });
  });

  it("alerts when no task at all is configured to absorb an employee's time", () => {
    const employee = makeEmployee({ id: "e1" });
    const context = makeContext({ employees: [employee], tasks: [] });

    const result = generatePlanning(context);

    expect(result.blocks).toHaveLength(0);
    expect(result.alerts).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("Aucune tâche disponible") })
    );
  });

  it("treats every task as a normal competitor at its own priority rank — no task is special-cased as an exclusive catch-all", () => {
    // "encodage" used to be forced into a separate last-resort pass regardless of its priority
    // rank. Now it must behave like any other task: if it's the highest-priority task an employee
    // is trained on, it wins the slot even when a lower-priority task also has room.
    const encodage = makeTask({ id: "encodage", name: "Encodage", priorityRank: 1, targetStaff: 1, maxStaff: 1 });
    const reencodage = makeTask({ id: "reencodage", name: "Réencodage", priorityRank: 2, targetStaff: 1, maxStaff: 1 });
    const employee = makeEmployee({
      id: "e1",
      skills: [
        { taskId: "encodage", status: "FORME" },
        { taskId: "reencodage", status: "FORME" },
      ],
    });
    const context = makeContext({ employees: [employee], tasks: [encodage, reencodage] });

    const result = generatePlanning(context);

    const firstBlock = result.blocks.find((b) => b.startTime === "08:00");
    expect(firstBlock?.taskId).toBe("encodage");
  });

  it("never exceeds maxStaff concurrently, even when many trained employees have leftover time to fall back into the task (regression: reported bug of 6 people on a maxStaff=1 task)", () => {
    const limited = makeTask({
      id: "limited",
      priorityRank: 1,
      minStaff: 0,
      targetStaff: 1,
      maxStaff: 1,
      requiresTraining: false,
    });
    const defaultTask = makeTask({
      id: "default",
      priorityRank: 2,
      requiresTraining: false,
      targetStaff: 0,
      maxStaff: 99,
    });
    const employees = Array.from({ length: 6 }, (_, i) => makeEmployee({ id: `e${i}` }));
    const context = makeContext({ employees, tasks: [limited, defaultTask] });

    const result = generatePlanning(context);

    const limitedBlocks = result.blocks.filter((b) => b.taskId === "limited");
    // At most one block may exist on "limited" for every given minute of the day.
    const overlapsAnywhere = limitedBlocks.some((a) =>
      limitedBlocks.some((b) => a !== b && timeToMinutes(a.startTime) < timeToMinutes(b.endTime) && timeToMinutes(b.startTime) < timeToMinutes(a.endTime))
    );
    expect(overlapsAnywhere).toBe(false);
    expect(limitedBlocks.length).toBeLessThanOrEqual(1);
    // Everyone else's time should have landed on the default task instead of overflowing "limited".
    expect(result.blocks.filter((b) => b.taskId === "default").length).toBeGreaterThan(0);
  });

  it("allows maxStaff=1 to be reused by different employees whose shifts don't overlap in time (concurrent, not cumulative)", () => {
    const task = makeTask({ id: "t1", priorityRank: 1, targetStaff: 1, maxStaff: 1, requiresTraining: false });
    const morning = makeEmployee({ id: "morning", startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("12:00") });
    const afternoon = makeEmployee({ id: "afternoon", startMinutes: timeToMinutes("12:00"), endMinutes: timeToMinutes("16:00") });
    const context = makeContext({ employees: [morning, afternoon], tasks: [task] });

    const result = generatePlanning(context);

    const blocksOnTask = result.blocks.filter((b) => b.taskId === "t1");
    expect(blocksOnTask.map((b) => b.employeeId).sort()).toEqual(["afternoon", "morning"]);
  });

  it("only assigns an AFTERNOON task within the afternoon window (between morning and evening boundaries)", () => {
    const afternoonTask = makeTask({ id: "afternoon", priorityRank: 1, allowedSlot: "AFTERNOON", targetStaff: 1, maxStaff: 1 });
    const defaultTask = makeTask({ id: "default", priorityRank: 2, requiresTraining: false, targetStaff: 0, maxStaff: 99 });
    const employee = makeEmployee({
      id: "e1",
      startMinutes: timeToMinutes("08:00"),
      endMinutes: timeToMinutes("18:00"),
      skills: [{ taskId: "afternoon", status: "FORME" }],
    });
    const context = makeContext({ employees: [employee], tasks: [afternoonTask, defaultTask] });

    const result = generatePlanning(context);

    const afternoonBlock = result.blocks.find((b) => b.taskId === "afternoon");
    expect(afternoonBlock).toMatchObject({ startTime: "13:00", endTime: "18:00" });
  });

  it("only assigns an EVENING task after the afternoon boundary", () => {
    const eveningTask = makeTask({ id: "evening", priorityRank: 1, allowedSlot: "EVENING", targetStaff: 1, maxStaff: 1 });
    const defaultTask = makeTask({ id: "default", priorityRank: 2, requiresTraining: false, targetStaff: 0, maxStaff: 99 });
    const employee = makeEmployee({
      id: "e1",
      startMinutes: timeToMinutes("16:00"),
      endMinutes: timeToMinutes("21:00"),
      skills: [{ taskId: "evening", status: "FORME" }],
    });
    const context = makeContext({ employees: [employee], tasks: [eveningTask, defaultTask] });

    const result = generatePlanning(context);

    const eveningBlock = result.blocks.find((b) => b.taskId === "evening");
    expect(eveningBlock).toMatchObject({ startTime: "18:00", endTime: "21:00" });
  });

  it("places a CUSTOM task at exactly its configured start/end, never shifted or partial", () => {
    const customTask = makeTask({
      id: "custom",
      priorityRank: 1,
      allowedSlot: "CUSTOM",
      customStartMinutes: timeToMinutes("09:00"),
      customEndMinutes: timeToMinutes("10:00"),
      targetStaff: 1,
      maxStaff: 1,
    });
    const employee = makeEmployee({
      id: "e1",
      startMinutes: timeToMinutes("08:00"),
      endMinutes: timeToMinutes("16:00"),
      skills: [{ taskId: "custom", status: "FORME" }],
    });
    const context = makeContext({ employees: [employee], tasks: [customTask] });

    const result = generatePlanning(context);

    const customBlock = result.blocks.find((b) => b.taskId === "custom");
    expect(customBlock).toMatchObject({ startTime: "09:00", endTime: "10:00" });
  });

  it("never assigns a CUSTOM task to an employee whose shift doesn't fully cover its exact window (no partial placement)", () => {
    const customTask = makeTask({
      id: "custom",
      priorityRank: 1,
      allowedSlot: "CUSTOM",
      customStartMinutes: timeToMinutes("09:00"),
      customEndMinutes: timeToMinutes("10:00"),
      targetStaff: 1,
      maxStaff: 1,
    });
    const defaultTask = makeTask({ id: "default", priorityRank: 2, requiresTraining: false, targetStaff: 0, maxStaff: 99 });
    // Shift starts at 09:30, so it never covers the full 09:00-10:00 custom window.
    const employee = makeEmployee({
      id: "e1",
      startMinutes: timeToMinutes("09:30"),
      endMinutes: timeToMinutes("16:00"),
      skills: [{ taskId: "custom", status: "FORME" }],
    });
    const context = makeContext({ employees: [employee], tasks: [customTask, defaultTask] });

    const result = generatePlanning(context);

    expect(result.blocks.some((b) => b.taskId === "custom")).toBe(false);
    expect(result.blocks.find((b) => b.taskId === "default")).toMatchObject({ startTime: "09:30", endTime: "16:00" });
  });

  it("rejects a second CUSTOM assignment when maxStaff=1 already has the exact window reserved", () => {
    const customTask = makeTask({
      id: "custom",
      priorityRank: 1,
      allowedSlot: "CUSTOM",
      customStartMinutes: timeToMinutes("09:00"),
      customEndMinutes: timeToMinutes("10:00"),
      requiresTraining: false,
      targetStaff: 2,
      maxStaff: 1,
    });
    const defaultTask = makeTask({ id: "default", priorityRank: 2, requiresTraining: false, targetStaff: 0, maxStaff: 99 });
    const employees = [
      makeEmployee({ id: "e1", startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("16:00") }),
      makeEmployee({ id: "e2", startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("16:00") }),
    ];
    const context = makeContext({ employees, tasks: [customTask, defaultTask] });

    const result = generatePlanning(context);

    const customBlocks = result.blocks.filter((b) => b.taskId === "custom");
    expect(customBlocks).toHaveLength(1);
    expect(customBlocks[0]).toMatchObject({ startTime: "09:00", endTime: "10:00" });
  });

  it("covers the whole shift with no gap when a CUSTOM block lands mid-shift (regression: reported gaps in Noah/Pascal's 22/07 schedule)", () => {
    const customTask = makeTask({
      id: "custom",
      priorityRank: 1,
      allowedSlot: "CUSTOM",
      customStartMinutes: timeToMinutes("12:00"),
      customEndMinutes: timeToMinutes("13:00"),
      requiresTraining: false,
      targetStaff: 1,
      maxStaff: 1,
    });
    // Two ordinary catch-all-ish tasks, not one: now that every task (including a former "default")
    // is capped at one block per employee per day like any other, filling both the before AND after
    // segments left by the CUSTOM block needs two distinct tasks in the roster.
    const before = makeTask({ id: "before", priorityRank: 2, requiresTraining: false, targetStaff: 0, maxStaff: 99 });
    const after = makeTask({ id: "after", priorityRank: 3, requiresTraining: false, targetStaff: 0, maxStaff: 99 });
    const employee = makeEmployee({ id: "e1", startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("16:00") });
    const context = makeContext({ employees: [employee], tasks: [customTask, before, after] });

    const result = generatePlanning(context);

    const blocks = result.blocks
      .filter((b) => b.employeeId === "e1")
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    expect(blocks[0].startTime).toBe("08:00");
    expect(blocks[blocks.length - 1].endTime).toBe("16:00");
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].startTime).toBe(blocks[i - 1].endTime);
    }
    expect(blocks.some((b) => b.taskId === "custom" && b.startTime === "12:00" && b.endTime === "13:00")).toBe(true);
  });

  it("covers the whole shift with no gap when a task's capacity only frees up later than the employee's shift start (regression: same root cause as the CUSTOM gap)", () => {
    const limited = makeTask({
      id: "limited",
      priorityRank: 1,
      requiresTraining: false,
      targetStaff: 1,
      maxStaff: 1,
      maxContinuousMinutes: 480,
    });
    const defaultTask = makeTask({
      id: "default",
      priorityRank: 2,
      requiresTraining: false,
      targetStaff: 0,
      maxStaff: 99,
    });
    const first = makeEmployee({ id: "first", startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("14:00") });
    const second = makeEmployee({ id: "second", startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("16:00") });
    const context = makeContext({ employees: [first, second], tasks: [limited, defaultTask] });

    const result = generatePlanning(context);

    // "first" takes the only maxStaff=1 slot on "limited" for their whole shift (08:00-14:00), so
    // "second" can only get onto "limited" from 14:00 onward — the 08:00-14:00 gap must be filled
    // by something else instead of being silently dropped.
    const secondBlocks = result.blocks
      .filter((b) => b.employeeId === "second")
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    expect(secondBlocks[0].startTime).toBe("08:00");
    expect(secondBlocks[secondBlocks.length - 1].endTime).toBe("16:00");
    for (let i = 1; i < secondBlocks.length; i++) {
      expect(secondBlocks[i].startTime).toBe(secondBlocks[i - 1].endTime);
    }
  });

  it("keeps scanning within the same free segment for a long-enough window when the first available slot is too short (minContinuousMinutes)", () => {
    const task = makeTask({
      id: "t1",
      priorityRank: 1,
      requiresTraining: false,
      minContinuousMinutes: 60,
      maxContinuousMinutes: 480,
      staffingBands: [
        { startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("08:20"), minStaff: 0, targetStaff: 1, maxStaff: 1 },
        { startMinutes: timeToMinutes("08:20"), endMinutes: timeToMinutes("08:50"), minStaff: 0, targetStaff: 0, maxStaff: 0 },
        { startMinutes: timeToMinutes("08:50"), endMinutes: timeToMinutes("10:00"), minStaff: 0, targetStaff: 1, maxStaff: 1 },
      ],
    });
    const employee = makeEmployee({ id: "e1", startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("10:00") });
    const context = makeContext({ employees: [employee], tasks: [task] });

    const result = generatePlanning(context);

    const block = result.blocks.find((b) => b.taskId === "t1");
    // The first 20 minutes (08:00-08:20) are available but too short to satisfy the 60-minute
    // minimum, and the task is unstaffed (target 0) from 08:20-08:50 — the engine must not give up
    // on the segment after that first too-short slot, and instead find the 70-minute window from
    // 08:50 onward that does satisfy the minimum.
    expect(block).toMatchObject({ startTime: "08:50", endTime: "10:00" });
  });

  it("never places a block shorter than its task's minContinuousMinutes, even when that's the only immediately available slot", () => {
    const task = makeTask({
      id: "t1",
      priorityRank: 1,
      requiresTraining: false,
      minContinuousMinutes: 60,
      maxContinuousMinutes: 480,
      targetStaff: 1,
      maxStaff: 1,
    });
    // "short" only has 30 minutes available — never enough to satisfy the 60-minute minimum.
    const short = makeEmployee({ id: "short", startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("08:30") });
    const long = makeEmployee({ id: "long", startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("16:00") });
    const context = makeContext({ employees: [short, long], tasks: [task] });

    const result = generatePlanning(context);

    expect(result.blocks.some((b) => b.employeeId === "short" && b.taskId === "t1")).toBe(false);
    const longBlock = result.blocks.find((b) => b.employeeId === "long" && b.taskId === "t1");
    expect(longBlock).toBeDefined();
    expect(timeToMinutes(longBlock!.endTime) - timeToMinutes(longBlock!.startTime)).toBeGreaterThanOrEqual(60);
  });

  it("staffs a task at each band's own target on either side of a time boundary, not the earlier band's max (regression: user-reported case of 4 people 8h-17h30, 1 person after)", () => {
    const encodage = makeTask({
      id: "encodage",
      priorityRank: 1,
      requiresTraining: false,
      maxContinuousMinutes: 720,
      staffingBands: [
        { startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("17:30"), minStaff: 0, targetStaff: 4, maxStaff: 4 },
        { startMinutes: timeToMinutes("17:30"), endMinutes: timeToMinutes("20:00"), minStaff: 0, targetStaff: 1, maxStaff: 1 },
      ],
    });
    const employees = Array.from({ length: 5 }, (_, i) =>
      makeEmployee({ id: `e${i}`, startMinutes: timeToMinutes("08:00"), endMinutes: timeToMinutes("20:00") })
    );
    const context = makeContext({ employees, tasks: [encodage] });

    const result = generatePlanning(context);

    const countAt = (time: string) => {
      const m = timeToMinutes(time);
      return result.blocks.filter(
        (b) => b.taskId === "encodage" && timeToMinutes(b.startTime) <= m && m < timeToMinutes(b.endTime)
      ).length;
    };
    expect(countAt("09:00")).toBe(4);
    expect(countAt("18:00")).toBe(1);
  });
});
