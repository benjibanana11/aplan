import { Router } from "express";
import bcrypt from "bcrypt";
import { registerSchema, loginSchema, type Role } from "@aplan/shared";
import { prisma } from "../db.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { teamCode, name, email, password } = parsed.data;

  const organization = await prisma.organization.findUnique({ where: { teamCode } });
  if (!organization) {
    res.status(400).json({ error: "Code d'équipe invalide" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Un compte existe déjà avec cet email" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      organizationId: organization.id,
      name,
      email,
      passwordHash,
      role: "EMPLOYEE",
      hireDate: new Date(),
    },
  });

  req.session.userId = user.id;
  req.session.role = user.role as Role;
  req.session.organizationId = user.organizationId;
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    res.status(401).json({ error: "Identifiants invalides" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Identifiants invalides" });
    return;
  }

  req.session.userId = user.id;
  req.session.role = user.role as Role;
  req.session.organizationId = user.organizationId;
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).send();
  });
});

authRouter.get("/me", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});
