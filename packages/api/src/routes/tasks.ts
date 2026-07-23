import { Router } from "express";
import { taskInputSchema, reorderTasksSchema } from "@aplan/shared";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";

export const tasksRouter = Router();

tasksRouter.get("/", requireAuth, async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { teamId: req.session.teamId },
    orderBy: { priorityRank: "asc" },
    include: { staffingBands: true },
  });
  res.json(tasks);
});

tasksRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = taskInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { staffingBands, ...scalarFields } = parsed.data;
  const teamId = req.session.teamId!;
  const task = await prisma.$transaction(async (tx) => {
    const maxRank = await tx.task.aggregate({
      where: { teamId },
      _max: { priorityRank: true },
    });
    return tx.task.create({
      data: {
        ...scalarFields,
        teamId,
        priorityRank: (maxRank._max.priorityRank ?? 0) + 1,
        staffingBands: { create: staffingBands },
      },
      include: { staffingBands: true },
    });
  });
  res.status(201).json(task);
});

tasksRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = taskInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.task.findFirst({
    where: { id: req.params.id, teamId: req.session.teamId },
  });
  if (!existing) {
    res.status(404).json({ error: "Tâche introuvable" });
    return;
  }

  const { staffingBands, ...scalarFields } = parsed.data;
  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      ...scalarFields,
      staffingBands: { deleteMany: {}, create: staffingBands },
    },
    include: { staffingBands: true },
  });
  res.json(task);
});

tasksRouter.delete("/:id", requireAdmin, async (req, res) => {
  const existing = await prisma.task.findFirst({
    where: { id: req.params.id, teamId: req.session.teamId },
  });
  if (!existing) {
    res.status(404).json({ error: "Tâche introuvable" });
    return;
  }

  await prisma.task.delete({ where: { id: existing.id } });
  res.status(204).send();
});

tasksRouter.patch("/reorder", requireAdmin, async (req, res) => {
  const parsed = reorderTasksSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { orderedIds } = parsed.data;
  const teamId = req.session.teamId;
  const teamTasks = await prisma.task.findMany({
    where: { teamId, id: { in: orderedIds } },
    select: { id: true },
  });
  if (teamTasks.length !== orderedIds.length) {
    res.status(400).json({ error: "Liste de tâches invalide" });
    return;
  }

  // Deux passes pour éviter de violer @@unique([teamId, priorityRank])
  // le temps du réordonnancement (SQLite ne supporte pas les contraintes différées).
  await prisma.$transaction([
    ...orderedIds.map((id, index) => prisma.task.update({ where: { id }, data: { priorityRank: -(index + 1) } })),
    ...orderedIds.map((id, index) => prisma.task.update({ where: { id }, data: { priorityRank: index + 1 } })),
  ]);

  const tasks = await prisma.task.findMany({
    where: { teamId },
    orderBy: { priorityRank: "asc" },
  });
  res.json(tasks);
});
