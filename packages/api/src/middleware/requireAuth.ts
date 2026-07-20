import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  if (req.session.role !== "ADMIN") {
    res.status(403).json({ error: "Réservé aux administrateurs" });
    return;
  }
  next();
}
