import { Router } from "express";
import bcrypt from "bcrypt";
import { createEmployeeSchema, updateEmployeeSchema, type Role } from "@aplan/shared";
import { prisma } from "../db.js";
import { requireAdmin } from "../middleware/requireAuth.js";

export const employeesRouter = Router();

function mapEmployee(membership: { role: string; active: boolean }, user: { id: string; name: string; email: string; hireDate: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: membership.role as Role,
    active: membership.active,
    hireDate: user.hireDate,
  };
}

employeesRouter.get("/", requireAdmin, async (req, res) => {
  const memberships = await prisma.teamMembership.findMany({
    where: { teamId: req.session.teamId },
    include: { user: { select: { id: true, name: true, email: true, hireDate: true } } },
    orderBy: { user: { name: "asc" } },
  });
  res.json(memberships.map((m) => mapEmployee(m, m.user)));
});

employeesRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, email, password, hireDate } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Un compte existe déjà avec cet email" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const teamId = req.session.teamId!;
  const { user, membership } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, passwordHash, hireDate: hireDate ? new Date(hireDate) : new Date() },
    });
    const membership = await tx.teamMembership.create({
      data: { userId: user.id, teamId, role: "EMPLOYEE", active: true },
    });
    return { user, membership };
  });
  res.status(201).json(mapEmployee(membership, user));
});

employeesRouter.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const teamId = req.session.teamId!;
  const membership = await prisma.teamMembership.findFirst({
    where: { userId: req.params.id, teamId },
    include: { user: true },
  });
  if (!membership) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const { name, email, active, hireDate } = parsed.data;

  if (email !== undefined && email !== membership.user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Un compte existe déjà avec cet email" });
      return;
    }
  }

  const [updatedUser, updatedMembership] = await prisma.$transaction([
    prisma.user.update({
      where: { id: membership.userId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(hireDate !== undefined ? { hireDate: new Date(hireDate) } : {}),
      },
    }),
    prisma.teamMembership.update({
      where: { id: membership.id },
      data: { ...(active !== undefined ? { active } : {}) },
    }),
  ]);
  res.json(mapEmployee(updatedMembership, updatedUser));
});

employeesRouter.delete("/:id", requireAdmin, async (req, res) => {
  const teamId = req.session.teamId!;
  const membership = await prisma.teamMembership.findFirst({ where: { userId: req.params.id, teamId } });
  if (!membership) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  if (membership.userId === req.session.userId) {
    res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte" });
    return;
  }

  if (membership.role === "ADMIN") {
    const adminCount = await prisma.teamMembership.count({ where: { teamId, role: "ADMIN" } });
    if (adminCount <= 1) {
      res.status(400).json({ error: "Impossible de supprimer le dernier administrateur" });
      return;
    }
  }

  // On retire l'employé uniquement de cette équipe (et ses données propres à cette équipe) —
  // un compte lié à plusieurs équipes garde son accès aux autres. On ne supprime le compte lui-même
  // que s'il ne lui reste plus aucune équipe, pour ne pas laisser de compte orphelin sans accès nulle part.
  await prisma.$transaction([
    prisma.workSchedule.deleteMany({ where: { employeeId: membership.userId, teamId } }),
    prisma.planningBlock.deleteMany({ where: { employeeId: membership.userId, teamId } }),
    prisma.absence.deleteMany({ where: { employeeId: membership.userId, teamId } }),
    prisma.employeeTaskSkill.deleteMany({ where: { employeeId: membership.userId, teamId } }),
    prisma.teamMembership.delete({ where: { id: membership.id } }),
  ]);

  const remainingMemberships = await prisma.teamMembership.count({ where: { userId: membership.userId } });
  if (remainingMemberships === 0) {
    await prisma.user.delete({ where: { id: membership.userId } });
  }

  res.status(204).send();
});
