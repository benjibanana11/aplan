import { describe, expect, it } from "vitest";
import { pickReplacement } from "./pickReplacement.js";
import { timeToMinutes } from "./time.js";
import { emptyEquity, makeEmployee, makeTask } from "./testFixtures.js";
import type { EquityStats } from "./types.js";

const block = { start: timeToMinutes("08:00"), end: timeToMinutes("10:00") };

describe("pickReplacement", () => {
  it("picks a trained, available employee who isn't the absent one", () => {
    const task = makeTask({ id: "t1", priorityRank: 1 });
    const absent = makeEmployee({ id: "absent", skills: [{ taskId: "t1", status: "FORME" }] });
    const candidate = makeEmployee({ id: "candidate", skills: [{ taskId: "t1", status: "FORME" }] });

    const result = pickReplacement("absent", task, block, [absent, candidate], new Map(), emptyEquity());

    expect(result?.id).toBe("candidate");
  });

  it("excludes an untrained employee", () => {
    const task = makeTask({ id: "t1", priorityRank: 1 });
    const untrained = makeEmployee({ id: "untrained", skills: [] });

    const result = pickReplacement("absent", task, block, [untrained], new Map(), emptyEquity());

    expect(result).toBeNull();
  });

  it("excludes an employee whose shift doesn't fully cover the vacant block", () => {
    const task = makeTask({ id: "t1", priorityRank: 1 });
    const shortShift = makeEmployee({
      id: "shortShift",
      startMinutes: timeToMinutes("09:00"), // starts after the block begins
      skills: [{ taskId: "t1", status: "FORME" }],
    });

    const result = pickReplacement("absent", task, block, [shortShift], new Map(), emptyEquity());

    expect(result).toBeNull();
  });

  it("excludes an employee already busy on another task during the vacant block", () => {
    const task = makeTask({ id: "t1", priorityRank: 1 });
    const busy = makeEmployee({ id: "busy", skills: [{ taskId: "t1", status: "FORME" }] });
    const busyRanges = new Map([["busy", [{ start: timeToMinutes("08:30"), end: timeToMinutes("09:30") }]]]);

    const result = pickReplacement("absent", task, block, [busy], busyRanges, emptyEquity());

    expect(result).toBeNull();
  });

  it("does not exclude an employee whose other assignment doesn't overlap the vacant block", () => {
    const task = makeTask({ id: "t1", priorityRank: 1 });
    const free = makeEmployee({ id: "free", skills: [{ taskId: "t1", status: "FORME" }] });
    const busyRanges = new Map([["free", [{ start: timeToMinutes("10:00"), end: timeToMinutes("12:00") }]]]);

    const result = pickReplacement("absent", task, block, [free], busyRanges, emptyEquity());

    expect(result?.id).toBe("free");
  });

  it("prefers rotation (didn't do this task yesterday) over a better equity score", () => {
    const task = makeTask({ id: "t1", priorityRank: 1 });
    const didYesterday = makeEmployee({ id: "didYesterday", skills: [{ taskId: "t1", status: "FORME" }], yesterdayTaskIds: ["t1"] });
    const fresh = makeEmployee({ id: "fresh", skills: [{ taskId: "t1", status: "FORME" }] });
    const equity: EquityStats = {
      countByEmployeeTask: new Map([
        ["didYesterday:t1", 0],
        ["fresh:t1", 5],
      ]),
      teamAverageByTask: new Map([["t1", 2]]),
    };

    const result = pickReplacement("absent", task, block, [didYesterday, fresh], new Map(), equity);

    expect(result?.id).toBe("fresh");
  });

  it("returns null when nobody is eligible", () => {
    const task = makeTask({ id: "t1", priorityRank: 1 });

    const result = pickReplacement("absent", task, block, [], new Map(), emptyEquity());

    expect(result).toBeNull();
  });
});
