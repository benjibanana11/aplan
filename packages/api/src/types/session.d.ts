import "express-session";
import type { Role } from "@aplan/shared";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: Role;
    companyId?: string;
    teamId?: string;
    // Identifiant temporaire posé entre la vérification du mot de passe et le choix d'équipe,
    // pour un compte lié à plusieurs équipes — voir POST /auth/login et POST /auth/select-team.
    // Distinct de `userId` pour qu'aucune route protégée par requireAuth ne soit accessible tant
    // que l'équipe n'a pas été choisie.
    pendingUserId?: string;
  }
}
