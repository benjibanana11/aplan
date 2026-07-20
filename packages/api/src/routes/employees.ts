import { Router } from "express";
import bcrypt from "bcrypt";
import { createEmployeeSchema, updateEmployeeSchema } from "@aplan/shared";
import { prisma } from "../db.js";
import { requireAdmin } from "../middleware/requireAuth.js";

export const employeesRouter = Router();

employeesRouter.get("/", requireAdmin, async (req, res) => {
  const employees = await prisma.user.findMany({
    where: { organizationId: req.session.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true, hireDate: true },
  });
  res.json(employees);
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
  const employee = await prisma.user.create({
    data: {
      organizationId: req.session.organizationId!,
      name,
      email,
      passwordHash,
      role: "EMPLOYEE",
      hireDate: hireDate ? new Date(hireDate) : new Date(),
    },
    select: { id: true, name: true, email: true, role: true, active: true, hireDate: true },
  });
  res.status(201).json(employee);
});

employeesRouter.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const employee = await prisma.user.findFirst({
    where: { id: req.params.id, organizationId: req.session.organizationId },
  });
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const { name, email, active, hireDate } = parsed.data;

  if (email !== undefined && email !== employee.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Un compte existe déjà avec cet email" });
      return;
    }
  }

  const updated = await prisma.user.update({
    where: { id: employee.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(hireDate !== undefined ? { hireDate: new Date(hireDate) } : {}),
    },
    select: { id: true, name: true, email: true, role: true, active: true, hireDate: true },
  });
  res.json(updated);
});

employeesRouter.delete("/:id", requireAdmin, async (req, res) => {
  const organizationId = req.session.organizationId!;
  const employee = await prisma.user.findFirst({ where: { id: req.params.id, organizationId } });
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  if (employee.id === req.session.userId) {
    res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte" });
    return;
  }

  if (employee.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { organizationId, role: "ADMIN" } });
    if (adminCount <= 1) {
      res.status(400).json({ error: "Impossible de supprimer le dernier administrateur" });
      return;
    }
  }

  await prisma.user.delete({ where: { id: employee.id } });
  res.status(204).send();
});
