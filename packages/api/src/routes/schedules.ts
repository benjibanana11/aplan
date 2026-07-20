import { Router } from "express";
import { putMonthlyScheduleSchema, upsertScheduleDaySchema } from "@aplan/shared";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";
import { parseDateOnly } from "../planning/time.js";

export const schedulesRouter = Router();

function monthRange(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  return { start, end };
}

schedulesRouter.get("/today", requireAuth, async (req, res) => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const entries = await prisma.workSchedule.findMany({
    where: {
      date: { gte: start, lt: end },
      employee: { organizationId: req.session.organizationId },
    },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { startTime: "asc" },
  });
  res.json(entries);
});

schedulesRouter.get("/", requireAdmin, async (req, res) => {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Paramètre month requis (AAAA-MM)" });
    return;
  }
  const { start, end } = monthRange(month);

  const [entries, absences] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { date: { gte: start, lt: end }, employee: { organizationId: req.session.organizationId } },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: [{ employee: { name: "asc" } }, { date: "asc" }],
    }),
    // REJECTED n'exclut personne (la personne est bien présente), PENDING et VALIDATED oui.
    prisma.absence.findMany({
      where: {
        date: { gte: start, lt: end },
        employee: { organizationId: req.session.organizationId },
        status: { not: "REJECTED" },
      },
      select: { employeeId: true, date: true, reason: true },
    }),
  ]);
  res.json({
    entries: entries.map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employee.name,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
    })),
    absences: absences.map((a) => ({
      employeeId: a.employeeId,
      date: a.date,
      reason: a.reason,
    })),
  });
});

schedulesRouter.get("/:employeeId", requireAuth, async (req, res) => {
  const { employeeId } = req.params;
  if (req.session.role !== "ADMIN" && req.session.userId !== employeeId) {
    res.status(403).json({ error: "Accès réservé à votre propre horaire" });
    return;
  }
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Paramètre month requis (AAAA-MM)" });
    return;
  }
  const { start, end } = monthRange(month);

  const entries = await prisma.workSchedule.findMany({
    where: { employeeId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
  });
  res.json(entries);
});

schedulesRouter.put("/:employeeId", requireAdmin, async (req, res) => {
  const { employeeId } = req.params;
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Paramètre month requis (AAAA-MM)" });
    return;
  }
  const parsed = putMonthlyScheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const employee = await prisma.user.findFirst({
    where: { id: employeeId, organizationId: req.session.organizationId },
  });
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const { start, end } = monthRange(month);
  const monthPrefix = month;
  for (const entry of parsed.data.entries) {
    if (!entry.date.startsWith(monthPrefix)) {
      res.status(400).json({ error: `La date ${entry.date} n'appartient pas au mois ${month}` });
      return;
    }
  }

  await prisma.$transaction([
    prisma.workSchedule.deleteMany({ where: { employeeId, date: { gte: start, lt: end } } }),
    prisma.workSchedule.createMany({
      data: parsed.data.entries.map((entry) => ({
        employeeId,
        date: new Date(`${entry.date}T00:00:00.000Z`),
        startTime: entry.startTime,
        endTime: entry.endTime,
      })),
    }),
  ]);

  const entries = await prisma.workSchedule.findMany({
    where: { employeeId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
  });
  res.json(entries);
});

schedulesRouter.put("/:employeeId/:date", requireAdmin, async (req, res) => {
  const { employeeId, date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Date invalide (AAAA-MM-JJ)" });
    return;
  }
  const parsed = upsertScheduleDaySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const employee = await prisma.user.findFirst({
    where: { id: employeeId, organizationId: req.session.organizationId },
  });
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const entry = await prisma.workSchedule.upsert({
    where: { employeeId_date: { employeeId, date: parseDateOnly(date) } },
    update: { startTime: parsed.data.startTime, endTime: parsed.data.endTime },
    create: {
      employeeId,
      date: parseDateOnly(date),
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
    },
  });
  res.json(entry);
});

schedulesRouter.delete("/:employeeId/:date", requireAdmin, async (req, res) => {
  const { employeeId, date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Date invalide (AAAA-MM-JJ)" });
    return;
  }

  const employee = await prisma.user.findFirst({
    where: { id: employeeId, organizationId: req.session.organizationId },
  });
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  await prisma.workSchedule.deleteMany({ where: { employeeId, date: parseDateOnly(date) } });
  res.status(204).send();
});
