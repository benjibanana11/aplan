import { Router } from "express";
import { generatePlanningSchema, validatePlanningSchema } from "@aplan/shared";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";
import { loadDayContext } from "../planning/loadDayContext.js";
import { generatePlanning } from "../planning/planningEngine.js";
import { parseDateOnly } from "../planning/time.js";
import { reconcileTrainingHours } from "../planning/reconcileTrainingHours.js";

export const planningRouter = Router();

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const d = parseDateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchPersistedBlocks(teamId: string, day: Date) {
  const saved = await prisma.planningBlock.findMany({
    where: { date: day, teamId },
    include: { employee: { select: { name: true } }, task: { select: { name: true } } },
    orderBy: [{ startTime: "asc" }],
  });
  return saved.map((b) => ({
    id: b.id,
    employeeId: b.employeeId,
    employeeName: b.employee.name,
    taskId: b.taskId,
    taskName: b.task.name,
    startTime: b.startTime,
    endTime: b.endTime,
    source: b.source,
    justification: b.justification,
    isTraining: b.isTraining,
    trainerName: b.trainerName,
    needsRevalidation: b.needsRevalidation,
  }));
}

planningRouter.post("/generate", requireAdmin, async (req, res) => {
  const parsed = generatePlanningSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const teamId = req.session.teamId!;
  const context = await loadDayContext(teamId, parsed.data.date);
  const result = generatePlanning(context);

  const employeeNames = new Map(context.employees.map((e) => [e.id, e.name]));
  const taskNames = new Map(context.tasks.map((t) => [t.id, t.name]));

  res.json({
    blocks: result.blocks.map((block) => ({
      ...block,
      source: "GENERATED",
      employeeName: employeeNames.get(block.employeeId) ?? "?",
      taskName: taskNames.get(block.taskId) ?? "?",
    })),
    alerts: result.alerts,
  });
});

planningRouter.post("/validate", requireAdmin, async (req, res) => {
  const parsed = validatePlanningSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const teamId = req.session.teamId!;
  const { date, blocks } = parsed.data;
  const day = parseDateOnly(date);

  const [memberships, tasks] = await Promise.all([
    prisma.teamMembership.findMany({ where: { teamId }, select: { userId: true } }),
    prisma.task.findMany({ where: { teamId }, select: { id: true } }),
  ]);
  const employeeIds = new Set(memberships.map((m) => m.userId));
  const taskIds = new Set(tasks.map((t) => t.id));
  const invalid = blocks.some((b) => !employeeIds.has(b.employeeId) || !taskIds.has(b.taskId));
  if (invalid) {
    res.status(400).json({ error: "Employé ou tâche invalide pour cette équipe" });
    return;
  }

  await prisma.$transaction([
    prisma.planningBlock.deleteMany({ where: { date: day, teamId } }),
    prisma.planningBlock.createMany({
      data: blocks.map((b) => ({
        employeeId: b.employeeId,
        taskId: b.taskId,
        teamId,
        date: day,
        startTime: b.startTime,
        endTime: b.endTime,
        source: b.source,
        justification: b.justification,
        isTraining: b.isTraining,
        trainerName: b.trainerName ?? null,
      })),
    }),
  ]);

  // Incrémente (ou corrige, si ce jour était déjà validé) les heures de formation des employés
  // EN_FORMATION en fonction des blocs "en formation" validés ci-dessus — voir reconcileTrainingHours.ts
  // pour la logique d'idempotence qui évite de compter plusieurs fois la même journée.
  await reconcileTrainingHours(teamId, day, blocks);

  res.json(await fetchPersistedBlocks(teamId, day));
});

planningRouter.get("/export", requireAdmin, async (req, res) => {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Paramètre month requis (AAAA-MM)" });
    return;
  }
  const teamId = req.session.teamId!;
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));

  const blocks = await prisma.planningBlock.findMany({
    where: { date: { gte: start, lt: end }, teamId },
    include: { employee: { select: { name: true } }, task: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["Date", "Employé", "Tâche", "Début", "Fin", "Source"].map(escapeCsv).join(",");
  const rows = blocks.map((b) =>
    [b.date.toISOString().slice(0, 10), b.employee.name, b.task.name, b.startTime, b.endTime, b.source]
      .map(escapeCsv)
      .join(",")
  );
  const csv = [header, ...rows].join("\r\n");

  const bom = String.fromCharCode(0xfeff); // pour un bon rendu des accents dans Excel
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="planning-${month}.csv"`);
  res.send(bom + csv);
});

planningRouter.get("/history", requireAdmin, async (req, res) => {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Paramètre month requis (AAAA-MM)" });
    return;
  }
  const teamId = req.session.teamId;
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));

  const blocks = await prisma.planningBlock.findMany({
    where: { date: { gte: start, lt: end }, teamId },
    select: { date: true, employeeId: true },
  });

  const byDay = new Map<string, { employeeIds: Set<string>; blockCount: number }>();
  for (const block of blocks) {
    const dayKey = block.date.toISOString().slice(0, 10);
    const entry = byDay.get(dayKey) ?? { employeeIds: new Set<string>(), blockCount: 0 };
    entry.employeeIds.add(block.employeeId);
    entry.blockCount += 1;
    byDay.set(dayKey, entry);
  }

  const days = Array.from(byDay.entries())
    .map(([date, entry]) => ({ date, employeeCount: entry.employeeIds.size, blockCount: entry.blockCount }))
    .sort((a, b) => b.date.localeCompare(a.date));

  res.json(days);
});

planningRouter.get("/stats", requireAdmin, async (req, res) => {
  const teamId = req.session.teamId;
  const to = typeof req.query.to === "string" ? req.query.to : today();
  const from = typeof req.query.from === "string" ? req.query.from : addDays(to, -90);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    res.status(400).json({ error: "Paramètres from/to invalides (AAAA-MM-JJ)" });
    return;
  }
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  end.setUTCDate(end.getUTCDate() + 1);

  const [memberships, tasks, blocks] = await Promise.all([
    prisma.teamMembership.findMany({
      where: { teamId, active: true },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.task.findMany({ where: { teamId }, select: { id: true, name: true } }),
    prisma.planningBlock.findMany({
      where: { date: { gte: start, lt: end }, teamId },
      select: { employeeId: true, taskId: true, date: true },
    }),
  ]);
  const employees = memberships.map((m) => ({ id: m.user.id, name: m.user.name }));

  // Une occurrence par jour civil, même si une tâche a été découpée en plusieurs blocs ce jour-là
  // (cohérent avec le calcul d'équité du moteur de génération, voir loadDayContext.ts).
  const countedDays = new Set<string>();
  const countByPair = new Map<string, number>();
  for (const block of blocks) {
    const dayKey = block.date.toISOString().slice(0, 10);
    const dedupeKey = `${block.employeeId}:${block.taskId}:${dayKey}`;
    if (countedDays.has(dedupeKey)) continue;
    countedDays.add(dedupeKey);
    const key = `${block.employeeId}:${block.taskId}`;
    countByPair.set(key, (countByPair.get(key) ?? 0) + 1);
  }

  res.json({
    employees,
    tasks,
    counts: Array.from(countByPair.entries()).map(([key, count]) => {
      const [employeeId, taskId] = key.split(":");
      return { employeeId, taskId, count };
    }),
  });
});

planningRouter.get("/:date", requireAuth, async (req, res) => {
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Date invalide (AAAA-MM-JJ)" });
    return;
  }
  const teamId = req.session.teamId!;
  res.json(await fetchPersistedBlocks(teamId, parseDateOnly(date)));
});
