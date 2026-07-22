import { Router } from "express";
import { createSkillSchema, updateSkillSchema } from "@aplan/shared";
import { prisma } from "../db.js";
import { requireAdmin } from "../middleware/requireAuth.js";

export const skillsRouter = Router();

skillsRouter.get("/", requireAdmin, async (req, res) => {
  const teamId = req.session.teamId;
  const skills = await prisma.employeeTaskSkill.findMany({
    where: { teamId },
    include: { employee: { select: { name: true } }, task: { select: { name: true } } },
  });
  res.json(
    skills.map((s) => ({
      employeeId: s.employeeId,
      employeeName: s.employee.name,
      taskId: s.taskId,
      taskName: s.task.name,
      status: s.status,
      hoursCompleted: s.hoursCompleted,
      hoursRequired: s.hoursRequired,
      validatedAt: s.validatedAt,
      validatedByUserId: s.validatedByUserId,
    }))
  );
});

skillsRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = createSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const teamId = req.session.teamId!;
  const { employeeId, taskId, hoursRequired } = parsed.data;

  const [membership, task] = await Promise.all([
    prisma.teamMembership.findFirst({ where: { userId: employeeId, teamId } }),
    prisma.task.findFirst({ where: { id: taskId, teamId } }),
  ]);
  if (!membership || !task) {
    res.status(404).json({ error: "Employé ou tâche introuvable" });
    return;
  }

  const existing = await prisma.employeeTaskSkill.findUnique({ where: { employeeId_taskId: { employeeId, taskId } } });
  if (existing) {
    res.status(409).json({ error: "Cette compétence existe déjà pour cet employé et cette tâche" });
    return;
  }

  const skill = await prisma.employeeTaskSkill.create({
    data: { employeeId, taskId, teamId, hoursRequired, status: "EN_FORMATION", hoursCompleted: 0 },
  });
  res.status(201).json(skill);
});

skillsRouter.patch("/:employeeId/:taskId", requireAdmin, async (req, res) => {
  const parsed = updateSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const teamId = req.session.teamId;
  const { employeeId, taskId } = req.params;

  const existing = await prisma.employeeTaskSkill.findFirst({
    where: { employeeId, taskId, teamId },
  });
  if (!existing) {
    res.status(404).json({ error: "Compétence introuvable" });
    return;
  }

  const { status, hoursCompleted, hoursRequired } = parsed.data;
  const isPromotion = status && status !== existing.status && (status === "FORME" || status === "REFERENT");

  const skill = await prisma.employeeTaskSkill.update({
    where: { employeeId_taskId: { employeeId, taskId } },
    data: {
      ...(hoursCompleted !== undefined ? { hoursCompleted } : {}),
      ...(hoursRequired !== undefined ? { hoursRequired } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(isPromotion ? { validatedAt: new Date(), validatedByUserId: req.session.userId } : {}),
    },
  });
  res.json(skill);
});

skillsRouter.delete("/:employeeId/:taskId", requireAdmin, async (req, res) => {
  const teamId = req.session.teamId;
  const { employeeId, taskId } = req.params;

  const existing = await prisma.employeeTaskSkill.findFirst({
    where: { employeeId, taskId, teamId },
  });
  if (!existing) {
    res.status(404).json({ error: "Compétence introuvable" });
    return;
  }

  await prisma.employeeTaskSkill.delete({ where: { employeeId_taskId: { employeeId, taskId } } });
  res.status(204).send();
});
