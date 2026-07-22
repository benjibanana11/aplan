import { Router } from "express";
import { createCompanySchema, createTeamSchema } from "@aplan/shared";
import { prisma } from "../db.js";
import { requireSuperAdmin } from "../middleware/requireAuth.js";

export const adminRouter = Router();

adminRouter.get("/companies", requireSuperAdmin, async (_req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: {
      teams: {
        orderBy: { name: "asc" },
        include: { _count: { select: { memberships: true } } },
      },
    },
  });
  res.json(
    companies.map((company) => ({
      id: company.id,
      name: company.name,
      teams: company.teams.map((team) => ({
        id: team.id,
        name: team.name,
        teamCode: team.teamCode,
        memberCount: team._count.memberships,
      })),
    }))
  );
});

adminRouter.post("/companies", requireSuperAdmin, async (req, res) => {
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, teamName, teamCode } = parsed.data;

  const existing = await prisma.team.findUnique({ where: { teamCode } });
  if (existing) {
    res.status(409).json({ error: "Ce code d'équipe existe déjà" });
    return;
  }

  const { company, team } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name } });
    const team = await tx.team.create({ data: { companyId: company.id, name: teamName, teamCode } });
    return { company, team };
  });

  res.status(201).json({
    id: company.id,
    name: company.name,
    teams: [{ id: team.id, name: team.name, teamCode: team.teamCode, memberCount: 0 }],
  });
});

adminRouter.post("/companies/:id/teams", requireSuperAdmin, async (req, res) => {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company) {
    res.status(404).json({ error: "Entreprise introuvable" });
    return;
  }

  const { name, teamCode } = parsed.data;
  const existing = await prisma.team.findUnique({ where: { teamCode } });
  if (existing) {
    res.status(409).json({ error: "Ce code d'équipe existe déjà" });
    return;
  }

  const team = await prisma.team.create({ data: { companyId: company.id, name, teamCode } });
  res.status(201).json({ id: team.id, name: team.name, teamCode: team.teamCode, memberCount: 0 });
});
