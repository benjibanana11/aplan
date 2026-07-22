import type { Request, Response, NextFunction } from "express";
import type { Role } from "@aplan/shared";
import { prisma } from "../db.js";

// Vérifie à chaque requête que la TeamMembership référencée par la session est toujours valide
// (pas seulement que la session contient un userId) : après un changement d'équipe, une
// désactivation, ou une rétrogradation de rôle, une session obsolète ne doit pas rester valable
// jusqu'à sa prochaine reconnexion. Le rôle est aussi rafraîchi depuis la base à chaque requête
// plutôt que fait confiance à la valeur mise en cache dans la session.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || !req.session.teamId) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId: req.session.userId, teamId: req.session.teamId } },
    select: { role: true, active: true },
  });
  if (!membership || !membership.active) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  req.session.role = membership.role as Role;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (req.session.role !== "ADMIN") {
      res.status(403).json({ error: "Réservé aux administrateurs" });
      return;
    }
    next();
  });
}
