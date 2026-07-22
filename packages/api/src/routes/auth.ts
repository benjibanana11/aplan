import { Router, type Request } from "express";
import bcrypt from "bcrypt";
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  selectTeamSchema,
  switchTeamSchema,
  type Role,
} from "@aplan/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRouter = Router();

interface TeamOption {
  companyId: string;
  companyName: string;
  teamId: string;
  teamName: string;
  role: Role;
}

async function activeTeamOptions(userId: string): Promise<TeamOption[]> {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId, active: true },
    include: { team: { include: { company: true } } },
  });
  return memberships.map((m) => ({
    companyId: m.team.companyId,
    companyName: m.team.company.name,
    teamId: m.teamId,
    teamName: m.team.name,
    role: m.role as Role,
  }));
}

function currentUserPayload(
  user: { id: string; name: string; email: string; isSuperAdmin: boolean },
  team: TeamOption,
  teams: TeamOption[]
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    role: team.role,
    companyId: team.companyId,
    companyName: team.companyName,
    teamId: team.teamId,
    teamName: team.teamName,
    teams,
  };
}

function finalizeSession(session: Request["session"], userId: string, team: TeamOption) {
  session.userId = userId;
  session.role = team.role;
  session.companyId = team.companyId;
  session.teamId = team.teamId;
  session.pendingUserId = undefined;
}

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { teamCode, name, email, password } = parsed.data;

  const team = await prisma.team.findUnique({ where: { teamCode }, include: { company: true } });
  if (!team) {
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
    data: { name, email, passwordHash, hireDate: new Date() },
  });
  await prisma.teamMembership.create({
    data: { userId: user.id, teamId: team.id, role: "EMPLOYEE", active: true },
  });

  const teamOption: TeamOption = {
    companyId: team.companyId,
    companyName: team.company.name,
    teamId: team.id,
    teamName: team.name,
    role: "EMPLOYEE",
  };
  finalizeSession(req.session, user.id, teamOption);
  res.status(201).json(currentUserPayload(user, teamOption, [teamOption]));
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "Identifiants invalides" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Identifiants invalides" });
    return;
  }

  const teams = await activeTeamOptions(user.id);
  if (teams.length === 0) {
    res.status(401).json({ error: "Ce compte n'est actif sur aucune équipe" });
    return;
  }

  if (teams.length === 1) {
    finalizeSession(req.session, user.id, teams[0]);
    res.json(currentUserPayload(user, teams[0], teams));
    return;
  }

  req.session.pendingUserId = user.id;
  res.json({ needsTeamSelection: true, teams });
});

authRouter.post("/select-team", async (req, res) => {
  const parsed = selectTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!req.session.pendingUserId) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  const userId = req.session.pendingUserId;
  const teams = await activeTeamOptions(userId);
  const team = teams.find((t) => t.teamId === parsed.data.teamId);
  if (!team) {
    res.status(403).json({ error: "Équipe invalide pour ce compte" });
    return;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  finalizeSession(req.session, userId, team);
  res.json(currentUserPayload(user, team, teams));
});

authRouter.post("/switch-team", requireAuth, async (req, res) => {
  const parsed = switchTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = req.session.userId!;
  const teams = await activeTeamOptions(userId);
  const team = teams.find((t) => t.teamId === parsed.data.teamId);
  if (!team) {
    res.status(403).json({ error: "Équipe invalide pour ce compte" });
    return;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  finalizeSession(req.session, userId, team);
  res.json(currentUserPayload(user, team, teams));
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).send();
  });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Mot de passe actuel incorrect" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.status(204).send();
});

authRouter.get("/me", async (req, res) => {
  if (!req.session.userId || !req.session.teamId) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  const [user, teams] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.session.userId } }),
    activeTeamOptions(req.session.userId),
  ]);
  const currentTeam = teams.find((t) => t.teamId === req.session.teamId);
  if (!user || !currentTeam) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  res.json(currentUserPayload(user, currentTeam, teams));
});
